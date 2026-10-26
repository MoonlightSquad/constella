import Fastify from 'fastify';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import fastifyWebsocket from '@fastify/websocket';
import * as dotenv from 'dotenv';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq, and, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { AuthRequestSchema, AuthTokenSchema, WebLoginSchema, WebPasswordResetSchema, WebRegisterSchema, createLogger, notifyClient, type ClientPayload } from '@constella/shared';
import { verifyTelegramInitData } from './utils/telegram.js';
import { registerConnection, unregisterConnection, broadcastToMatch } from './realtime.js';
import { appRouter } from './routers/_app.js';
import { createContext, isConfiguredAdmin } from './trpc.js';
import { registerTelegramPaymentRoutes } from './payments/routes.js';
import { registerBlogRoutes } from './blog/routes.js';
import { authTokens, closeDb, db, users, identities, webCredentials, photoAssets, swipes, events, userAchievements, paymentIntents, supportMessages, matches, messages } from '@constella/db';
import { appendTrpcOpenApiPaths } from './openapi.js';
import { isEmailDeliveryConfigured, sendTransactionalEmail } from './utils/email.js';
import { isPhotoStorageConfigured, removePhotoObjects } from './photos/storage.js';
import { hashOpaqueToken, issueAuthToken } from './utils/auth-tokens.js';
import { startBackgroundScheduler } from './engine/scheduler.js';
import { closeSentry, initSentry } from './sentry.js';
import { bot as telegramBot } from '@constella/bot';
import { isConfiguredTelegramWebhookSecret, isValidTelegramWebhookSecret } from './utils/telegram-webhook.js';
import { z } from 'zod';

declare module 'fastify' {
  interface FastifySchema {
    tags?: string[];
    summary?: string;
    description?: string;
    hide?: boolean;
  }
}

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
// Ініціалізація після dotenv, але до створення Fastify-інстансу.
initSentry();

const logger = createLogger('api');
/** Parses a JSON object, returning `{}` for malformed or non-object payloads. */
const parseJsonObject = (raw: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};
const configuredTrustProxy = process.env.TRUST_PROXY;
const trustProxy = configuredTrustProxy === 'true'
  ? true
  : !configuredTrustProxy || configuredTrustProxy === 'false'
    ? false
    : configuredTrustProxy.split(',').map((value) => value.trim()).filter(Boolean);

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-payments-token',
        'req.headers.x-telegram-init-data',
        'req.headers.x-telegram-bot-api-secret-token',
        'req.body.password',
        'req.body.confirmPassword',
        'req.body.token',
        'req.body.initData',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req(request) {
        return {
          id: request.id,
          method: request.method,
          url: request.url?.split('?')[0],
          hostname: request.hostname,
          remoteAddress: request.ip,
        };
      },
    },
  },
  requestIdHeader: false,
  genReqId: () => randomUUID(),
  trustProxy,
  bodyLimit: 1024 * 1024,
});

fastify.addHook('onRequest', async (request, reply) => {
  reply.header('x-request-id', request.id);
});

fastify.addHook('onResponse', async (request, reply) => {
  if (reply.statusCode >= 500) {
    request.log.error({ statusCode: reply.statusCode, responseTime: reply.elapsedTime }, 'Request failed');
  }
});

fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).type('application/json').send({
    error: 'Not found',
    path: request.url?.split('?')[0],
    requestId: request.id,
  });
});

fastify.setErrorHandler((error, request, reply) => {
  const statusCode = Number(error.statusCode ?? 500);
  request.log.error({ err: error, statusCode }, statusCode >= 500 ? 'Unhandled API error' : 'Request rejected');
  if (reply.sent) return;

  reply.status(statusCode).type('application/json').send({
    error: statusCode >= 500 ? 'Internal Server Error' : error.message || 'Request failed',
    requestId: request.id,
  });
});

const PORT = Number(process.env.PORT) || 4000;
const BOT_TOKEN = process.env.BOT_TOKEN;
let telegramBotInitialization: Promise<void> | undefined;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), 10);
const publicAppUrl = () => (process.env.WEB_APP_URL || 'http://localhost:5173').replace(/\/$/, '');

const sendVerificationEmail = async (email: string, userId: string) => {
  const token = await issueAuthToken(db, userId, 'email_verification');
  const url = `${publicAppUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  await sendTransactionalEmail({
    to: email,
    subject: 'Підтверди email у Constella',
    text: `Підтверди адресу email за посиланням (діє 24 години): ${url}`,
    html: `<p>Підтверди email для Constella.</p><p><a href="${url}">Підтвердити адресу</a></p><p>Посилання діє 24 години.</p>`,
  });
};

const sendPasswordResetEmail = async (email: string, userId: string) => {
  const token = await issueAuthToken(db, userId, 'password_reset');
  const url = `${publicAppUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
  await sendTransactionalEmail({
    to: email,
    subject: 'Відновлення пароля Constella',
    text: `Щоб змінити пароль, відкрий посилання (діє 1 годину): ${url}`,
    html: `<p>Надійшов запит на зміну пароля Constella.</p><p><a href="${url}">Задати новий пароль</a></p><p>Посилання діє 1 годину. Якщо це не ти, проігноруй лист.</p>`,
  });
};

async function initialize() {
  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN must be configured before starting the API.');
  }
  if (process.env.NODE_ENV === 'production') {
    if (!isConfiguredTelegramWebhookSecret(process.env.TELEGRAM_WEBHOOK_SECRET)) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET must be 32-256 characters using only letters, digits, underscores or hyphens in production.');
    }
    if (!isPhotoStorageConfigured()) {
      throw new Error('PHOTO_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_BASE_URL must be configured in production.');
    }
    if (!isEmailDeliveryConfigured()) {
      throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM must be configured in production.');
    }
    if (!process.env.PAYMENTS_INTERNAL_TOKEN || Buffer.byteLength(process.env.PAYMENTS_INTERNAL_TOKEN) < 32) {
      throw new Error('PAYMENTS_INTERNAL_TOKEN must contain at least 32 characters in production.');
    }
    let webOrigin: URL;
    try {
      webOrigin = new URL(process.env.WEB_APP_URL || '');
    } catch {
      throw new Error('WEB_APP_URL must be a valid public HTTPS origin in production.');
    }
    if (webOrigin.protocol !== 'https:' || webOrigin.pathname !== '/' || webOrigin.search || webOrigin.hash) {
      throw new Error('WEB_APP_URL must be a public HTTPS origin without a path in production.');
    }
  }
  let jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must contain at least 32 characters in production.');
    }
    jwtSecret = randomBytes(32).toString('hex');
    logger.warn('Using a temporary development JWT secret; sessions will reset when the API restarts.');
  }

  const allowedOrigins = [
    process.env.WEB_APP_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ].filter((origin): origin is string => Boolean(origin));

  if (!['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(process.env.LOG_LEVEL || 'info')) {
    throw new Error('LOG_LEVEL must be one of fatal, error, warn, info, debug, trace, or silent.');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  // Reflect the request origin when it is allowed. `credentials: true` is required so the
  // browser accepts responses to cross-origin requests that carry the `Authorization` header.
  // Without `Access-Control-Allow-Credentials: true` on the *actual* response (not just the
  // preflight), the browser blocks the request with a CORS error even when OPTIONS returns 204.
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // non-browser clients (curl, server-to-server)
      if (isProduction && origin !== process.env.WEB_APP_URL) return cb(null, false);
      if (!isProduction && !allowedOrigins.includes(origin)) return cb(null, false);
      return cb(null, origin);
    },
    credentials: true,
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'x-telegram-init-data',
      'x-payments-token',
      'x-request-id',
      'Accept',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  });
  await fastify.register(rateLimit, { global: true, max: Number(process.env.RATE_LIMIT_MAX) || 120, timeWindow: '1 minute' });

  await fastify.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: '30d' },
  });

  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
    },
  });

  // `@fastify/websocket` v10 is the fastify-4 line. Newer majors declare
  // `fastify: '5.x'` and fastify refuses to load them (FST_ERR_PLUGIN_VERSION_MISMATCH).
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1024 * 1024,
      perMessageDeflate: true,
      handshakeTimeout: 10000,
    },
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const MAX_WS_MESSAGE_LENGTH = 1000;
  const WS_SEND_WINDOW_MS = 60_000;
  const WS_MAX_SENDS_PER_WINDOW = 12;

  /**
   * Resolves the caller for a chat socket.
   *
   * The web client keeps its JWT in localStorage, and the browser cannot set
   * headers on a WebSocket handshake, so the token arrives as `?token=`.
   * A `token=` cookie is accepted as a fallback for non-browser clients.
   */
  const authenticateChatSocket = async (req: any): Promise<{ id: string } | null> => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const cookieToken = typeof req.headers.cookie === 'string'
      ? req.headers.cookie.split(';').map((c: string) => c.trim()).find((c: string) => c.startsWith('token='))?.slice('token='.length)
      : undefined;
    const token = url.searchParams.get('token') || cookieToken;
    if (!token) return null;

    let claims: { id: string; sessionVersion?: number };
    try {
      claims = fastify.jwt.verify<{ id: string; sessionVersion?: number }>(token);
    } catch {
      return null;
    }
    if (!claims?.id) return null;

    // Mirror the tRPC `protectedProcedure` guard: reject revoked sessions and
    // banned accounts so a socket cannot outlive its credentials.
    const [account] = await db
      .select({ sessionVersion: users.sessionVersion, bannedAt: users.bannedAt })
      .from(users)
      .where(eq(users.id, claims.id))
      .limit(1);
    if (!account) return null;
    if ((claims.sessionVersion ?? 0) !== account.sessionVersion) return null;
    if (account.bannedAt && !isConfiguredAdmin({ id: claims.id, telegramId: null })) return null;

    return { id: claims.id };
  };

  fastify.get('/api/chat/ws', { websocket: true }, (socket: any, req: any) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const requestedMatchId = url.searchParams.get('matchId') ?? '';

    // Resolve the handshake once; every inbound frame and the registration step
    // await the same promise, so ordering stays deterministic without dropping
    // frames that arrive while auth/DB work is in flight.
    type Handshake =
      | { ok: true; userId: string; matchId: string }
      | { ok: false; close: readonly [number, string] };

    const session: Promise<Handshake> =
      requestedMatchId && UUID_RE.test(requestedMatchId)
        ? (async (): Promise<Handshake> => {
            const user = await authenticateChatSocket(req);
            if (!user) return { ok: false, close: [4003, 'Unauthorized'] };
            // Only the two participants of the match may attach to its room.
            const [participant] = await db
              .select({ id: matches.id })
              .from(matches)
              .where(
                and(
                  eq(matches.id, requestedMatchId),
                  or(eq(matches.userOneId, user.id), eq(matches.userTwoId, user.id)),
                ),
              )
              .limit(1);
            if (!participant) return { ok: false, close: [4002, 'Match not found or not a participant'] };
            return { ok: true, userId: user.id, matchId: requestedMatchId };
          })()
        : Promise.resolve({ ok: false, close: [4001, 'Missing or invalid matchId'] });
    // Per-connection write budget. The HTTP rate limiter does not see WS frames,
    // so inbound sends are capped to the same 12/min the tRPC path enforces.
    let sendWindowStart = 0;
    let sendWindowCount = 0;
    const withinSendBudget = () => {
      const now = Date.now();
      if (now - sendWindowStart >= WS_SEND_WINDOW_MS) {
        sendWindowStart = now;
        sendWindowCount = 0;
      }
      sendWindowCount += 1;
      return sendWindowCount <= WS_MAX_SENDS_PER_WINDOW;
    };
    const replyError = (code: string, message: string) =>
      notifyClient({ conn: socket }, { type: 'error', code, message });

    socket.on('message', async (raw: Buffer | string) => {
      const auth = await session;
      if (!auth.ok) return;
      const { userId, matchId } = auth;

      let data: ClientPayload;
      try {
        data = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as ClientPayload;
      } catch {
        replyError('bad_frame', 'Malformed JSON frame.');
        return;
      }
      if (!data || typeof data !== 'object') return;
      // Frames are always scoped to the room the socket attached to, so a
      // client cannot address another match by spoofing `matchId`.
      if (data.matchId !== matchId) {
        replyError('wrong_match', 'Frame does not match this room.');
        return;
      }

      try {
        switch (data.type) {
          case 'send.message': {
            const body = typeof data.body === 'string' ? data.body.trim() : '';
            if (!body || body.length > MAX_WS_MESSAGE_LENGTH) {
              replyError('invalid_body', 'Message body is empty or too long.');
              return;
            }
            if (!withinSendBudget()) {
              replyError('rate_limited', 'Please slow down before sending more messages.');
              return;
            }
            // senderId always comes from the verified token, never the frame.
            const [m] = await db
              .insert(messages)
              .values({ matchId, senderId: userId, body, kind: 'text', deliveredAt: new Date() })
              .returning();
            if (m) broadcastToMatch(matchId, { type: 'chat.message', message: m });
            break;
          }
          case 'send.typing': {
            // Exclude the author: `chat.typing` drives the *peer's* indicator.
            broadcastToMatch(matchId, { type: 'chat.typing' }, userId);
            break;
          }
          case 'send.read': {
            const messageId = Number(data.messageId);
            if (!Number.isSafeInteger(messageId) || messageId <= 0) return;
            const [updated] = await db
              .update(messages)
              .set({ readAt: new Date() })
              .where(
                and(
                  eq(messages.id, messageId),
                  eq(messages.matchId, matchId),
                  // You may only acknowledge the other side's messages.
                  ne(messages.senderId, userId),
                ),
              )
              .returning();
            if (updated) {
              broadcastToMatch(matchId, {
                type: 'presence.read',
                messageId: updated.id,
                readAt: updated.readAt,
                matchId,
              });
            }
            break;
          }
          case 'send.linked':
          case 'send.pin': {
            const messageId = Number(data.messageId);
            if (!Number.isSafeInteger(messageId) || messageId <= 0 || typeof data.body !== 'string') return;
            const nextBody = data.type === 'send.pin'
              ? JSON.stringify({ ...parseJsonObject(data.body), pinned: true })
              : data.body;
            const [m] = await db
              .update(messages)
              .set({ body: nextBody })
              .where(and(eq(messages.id, messageId), eq(messages.matchId, matchId)))
              .returning();
            if (m) broadcastToMatch(matchId, { type: 'chat.message', message: m });
            break;
          }
          case 'send.media': {
            if (!withinSendBudget()) {
              replyError('rate_limited', 'Please slow down before sending more messages.');
              return;
            }
            if (typeof data.url !== 'string' || !data.url || data.url.length > 4096) {
              replyError('invalid_body', 'Media frame is missing a valid url.');
              return;
            }
            const mediaKind = data.kind === 'video' ? 'video' : 'image';
            const [m] = await db
              .insert(messages)
              .values({
                matchId,
                senderId: userId,
                body: JSON.stringify({ kind: mediaKind, url: data.url, fileName: data.fileName, size: data.size, localPath: data.localPath, icon: data.icon }),
                deliveredAt: new Date(),
              })
              .returning();
            if (m) broadcastToMatch(matchId, { type: 'chat.message', message: m });
            break;
          }
          default:
            replyError('unknown_type', 'Unsupported frame type.');
        }
      } catch (err) {
        logger.error('WebSocket message handler failed', { err, userId, matchId });
        replyError('internal', 'Server failed to process the frame.');
      }
    });

    socket.on('close', () => {
      void session.then((auth) => {
        if (auth.ok) unregisterConnection({ conn: socket, userId: auth.userId, matchId: auth.matchId });
      });
      logger.info('WebSocket chat client disconnected', { matchId: requestedMatchId });
    });

    socket.on('error', (err: Error) => {
      logger.error('WebSocket chat error', { err, matchId: requestedMatchId });
    });

    // Registration happens once the handshake resolves. If auth or the match
    // lookup failed, close with the matching RFC-style application code.
    void session
      .then((auth) => {
        if (!auth.ok) {
          const [code, reason] = auth.close;
          logger.info('WebSocket chat handshake rejected', { code, reason, matchId: requestedMatchId });
          socket.close(code, reason);
          return;
        }
        registerConnection({ conn: socket, userId: auth.userId, matchId: auth.matchId });
        logger.info('WebSocket chat client connected', { userId: auth.userId, matchId: auth.matchId });
      })
      .catch((err) => {
        logger.error('WebSocket chat handshake failed', { err, matchId: requestedMatchId });
        socket.close(1011, 'Handshake failed');
      });
  });

  registerTelegramPaymentRoutes(fastify);
  registerBlogRoutes(fastify);

  fastify.post('/telegram/webhook', async (request, reply) => {
    if (!isValidTelegramWebhookSecret(process.env.TELEGRAM_WEBHOOK_SECRET, request.headers['x-telegram-bot-api-secret-token'])) {
      return reply.status(401).send({ error: 'Unauthorized.' });
    }
    if (
      !request.body ||
      typeof request.body !== 'object' ||
      Array.isArray(request.body) ||
      !('update_id' in request.body) ||
      typeof request.body.update_id !== 'number' ||
      !Number.isSafeInteger(request.body.update_id)
    ) {
      return reply.status(400).send({ error: 'Invalid Telegram update.' });
    }
    telegramBotInitialization ??= telegramBot.init().catch((error) => {
      telegramBotInitialization = undefined;
      throw error;
    });
    await telegramBotInitialization;
    await telegramBot.handleUpdate(request.body as Parameters<typeof telegramBot.handleUpdate>[0]);
    return reply.send({ ok: true });
  });

  fastify.get('/health/live', { schema: { tags: ['Health'], summary: 'Liveness probe' } }, async () => ({
    ok: true,
    service: 'api',
    timestamp: new Date().toISOString(),
  }));

  fastify.get('/health/ready', { schema: { tags: ['Health'], summary: 'Readiness probe (database)' } }, async (request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return { ok: true, service: 'api', dependencies: { database: 'ok' }, timestamp: new Date().toISOString() };
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed');
      return reply.status(503).send({ ok: false, service: 'api', dependencies: { database: 'unavailable' }, requestId: request.id });
    }
  });

  fastify.get('/healthcheck', { schema: { tags: ['Health'], summary: 'Legacy liveness probe' } }, async () => ({
    ok: true,
    service: 'api',
    timestamp: new Date().toISOString(),
  }));

  fastify.post('/auth/telegram', { schema: { tags: ['Authentication'], summary: 'Authenticate Telegram Mini App initData', description: 'Verify the signed Telegram initData and return a Bearer JWT.', body: { type: 'object', required: ['initData'], properties: { initData: { type: 'string', minLength: 1 } }, additionalProperties: false } } }, async (request, reply) => {
    const parsedBody = AuthRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).type('application/json').send({
        error: 'Invalid request body',
        issues: parsedBody.error.issues,
      });
    }

    let tgUser;
    try {
      tgUser = verifyTelegramInitData(parsedBody.data.initData, BOT_TOKEN);
    } catch (err: any) {
      request.log.warn({ requestId: request.id }, 'Telegram initData verification failed');
      return reply.status(401).type('application/json').send({ error: 'Authentication failed', requestId: request.id });
    }

    const [identity] = await db
      .select()
      .from(identities)
      .where(and(eq(identities.provider, 'telegram'), eq(identities.providerUid, String(tgUser.id))))
      .limit(1);

    let userId = identity?.userId;

    if (!userId) {
      userId = await db.transaction(async (tx) => {
        const [newUser] = await tx
          .insert(users)
          .values({ birthdate: new Date('2000-01-01'), gender: 'none', lookingFor: [] })
          .returning({ id: users.id });
        const [createdIdentity] = await tx
          .insert(identities)
          .values({ provider: 'telegram', providerUid: String(tgUser.id), userId: newUser.id })
          .onConflictDoNothing()
          .returning({ userId: identities.userId });
        if (createdIdentity) return createdIdentity.userId;

        await tx.delete(users).where(eq(users.id, newUser.id));
        const [existingIdentity] = await tx
          .select({ userId: identities.userId })
          .from(identities)
          .where(and(eq(identities.provider, 'telegram'), eq(identities.providerUid, String(tgUser.id))))
          .limit(1);
        if (!existingIdentity) throw new Error('Telegram identity creation did not produce an account.');
        return existingIdentity.userId;
      });
    }

    const [account] = await db.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, userId)).limit(1);
    if (!account) return reply.status(401).send({ error: 'Authentication failed.', requestId: request.id });
    const token = fastify.jwt.sign({ id: userId, telegramId: tgUser.id, sessionVersion: account.sessionVersion, authProvider: 'telegram' });
    request.log.info({ userId }, 'Telegram authentication succeeded');
    return reply.status(200).type('application/json').send({ token, userId });
  });

  fastify.post(
    '/auth/web/register',
    { schema: { tags: ['Authentication'], summary: 'Register a browser account', body: { type: 'object', required: ['email', 'password', 'confirmPassword', 'acceptedTerms'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 12, maxLength: 72 }, confirmPassword: { type: 'string', minLength: 12, maxLength: 72 }, acceptedTerms: { type: 'boolean', enum: [true] } }, additionalProperties: false } }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = WebRegisterSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid registration details.', issues: parsed.error.issues });
      }
      if (Buffer.byteLength(parsed.data.password, 'utf8') > 72) {
        return reply.status(400).send({ error: 'Password must be no more than 72 bytes.' });
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      try {
        const user = await db.transaction(async (tx) => {
          const [createdUser] = await tx
            .insert(users)
            .values({ birthdate: new Date('2000-01-01'), gender: 'none', lookingFor: [] })
            .returning({ id: users.id, sessionVersion: users.sessionVersion });

          await tx.insert(webCredentials).values({ userId: createdUser.id, email: parsed.data.email, passwordHash });
          return createdUser;
        });

        try {
          await sendVerificationEmail(parsed.data.email, user.id);
        } catch (mailError) {
          request.log.error({ err: mailError, requestId: request.id }, 'Verification email delivery failed.');
          return reply.status(503).send({ error: 'Email delivery is temporarily unavailable. Please try again later.' });
        }
        return reply.status(201).send({ emailVerificationRequired: true });
      } catch (error: any) {
        if (error?.code === '23505') {
          return reply.status(409).send({ error: 'An account with this email already exists.' });
        }
        throw error;
      }
    }
  );

  fastify.post(
    '/auth/admin/login',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Sign in to the admin console',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254 },
            password: { type: 'string', minLength: 1, maxLength: 1024 },
          },
          additionalProperties: false,
        },
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = z.object({
        email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
        password: z.string().min(1).max(1024),
      }).safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid email or password.' });

      const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const configuredPassword = process.env.ADMIN_PASSWORD;
      if (!configuredEmail || !configuredPassword) {
        request.log.error({ requestId: request.id }, 'Admin login credentials are not configured.');
        return reply.status(503).send({ error: 'Admin login is not configured.' });
      }

      const matchesConfiguredValue = (provided: string, configured: string) =>
        timingSafeEqual(
          createHash('sha256').update(provided).digest(),
          createHash('sha256').update(configured).digest()
        );
      const emailMatches = matchesConfiguredValue(parsed.data.email, configuredEmail);
      const passwordMatches = matchesConfiguredValue(parsed.data.password, configuredPassword);
      if (!emailMatches || !passwordMatches) {
        return reply.status(401).send({ error: 'Email or password is incorrect.' });
      }

      const findAdminAccount = async () => {
        const [account] = await db.select({
          userId: webCredentials.userId,
          sessionVersion: users.sessionVersion,
        }).from(webCredentials)
          .innerJoin(users, eq(users.id, webCredentials.userId))
          .where(eq(webCredentials.email, configuredEmail))
          .limit(1);
        return account;
      };

      let account = await findAdminAccount();
      if (!account) {
        const unusablePasswordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
        try {
          account = await db.transaction(async (tx) => {
            const [user] = await tx.insert(users)
              .values({ birthdate: new Date('2000-01-01'), gender: 'none', lookingFor: [] })
              .returning({ userId: users.id, sessionVersion: users.sessionVersion });
            await tx.insert(webCredentials).values({
              userId: user.userId,
              email: configuredEmail,
              passwordHash: unusablePasswordHash,
              emailVerifiedAt: new Date(),
            });
            return user;
          });
        } catch (error: any) {
          if (error?.code !== '23505') throw error;
          account = await findAdminAccount();
          if (!account) throw error;
        }
      }
      if (!account) throw new Error('Admin account resolution failed after successful credential validation.');

      const token = fastify.jwt.sign({
        id: account.userId,
        telegramId: null,
        email: configuredEmail,
        authProvider: 'admin',
        sessionVersion: account.sessionVersion,
      }, { expiresIn: '8h' });
      return reply.send({ token, userId: account.userId });
    }
  );

  fastify.post(
    '/auth/web/login',
    { schema: { tags: ['Authentication'], summary: 'Sign in to browser account', body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 1, maxLength: 72 } }, additionalProperties: false } }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = WebLoginSchema.safeParse(request.body);
      if (!parsed.success || Buffer.byteLength(parsed.data?.password ?? '', 'utf8') > 72) {
        return reply.status(400).send({ error: 'Invalid email or password.' });
      }

      const [credential] = await db
        .select({
          userId: webCredentials.userId,
          passwordHash: webCredentials.passwordHash,
          emailVerifiedAt: webCredentials.emailVerifiedAt,
          sessionVersion: users.sessionVersion,
        })
        .from(webCredentials)
        .innerJoin(users, eq(users.id, webCredentials.userId))
        .where(eq(webCredentials.email, parsed.data.email))
        .limit(1);
      const passwordMatches = await bcrypt.compare(
        parsed.data.password,
        credential?.passwordHash ?? DUMMY_PASSWORD_HASH
      );

      if (!credential || !passwordMatches) {
        return reply.status(401).send({ error: 'Email or password is incorrect.' });
      }
      if (!credential.emailVerifiedAt) {
        return reply.status(403).send({ code: 'EMAIL_NOT_VERIFIED', error: 'Verify your email address before signing in.' });
      }

      await db
        .update(webCredentials)
        .set({ lastLoginAt: new Date() })
        .where(eq(webCredentials.userId, credential.userId));
      const token = fastify.jwt.sign({
        id: credential.userId, telegramId: null, authProvider: 'web', sessionVersion: credential.sessionVersion,
      });
      return reply.send({ token, userId: credential.userId });
    }
  );

  fastify.post('/auth/web/verification/resend', {
    schema: { tags: ['Authentication'], summary: 'Resend email verification', body: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } }, additionalProperties: false } },
    config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = WebLoginSchema.pick({ email: true }).safeParse(request.body);
    if (!parsed.success) return reply.status(200).send({ ok: true });
    const [credential] = await db.select({ userId: webCredentials.userId, emailVerifiedAt: webCredentials.emailVerifiedAt })
      .from(webCredentials).where(eq(webCredentials.email, parsed.data.email)).limit(1);
    if (credential && !credential.emailVerifiedAt) {
      try {
        await sendVerificationEmail(parsed.data.email, credential.userId);
      } catch (mailError) {
        request.log.error({ err: mailError, requestId: request.id }, 'Verification email delivery failed.');
      }
    }
    return reply.send({ ok: true });
  });

  fastify.post('/auth/web/verification/complete', {
    schema: { tags: ['Authentication'], summary: 'Verify a web account email', body: { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 32, maxLength: 256 } }, additionalProperties: false } },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = AuthTokenSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid or expired verification link.' });
    const now = new Date();
    const [token] = await db.select().from(authTokens).where(and(
      eq(authTokens.tokenHash, hashOpaqueToken(parsed.data.token)),
      eq(authTokens.purpose, 'email_verification'),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, now),
    )).limit(1);
    if (!token) return reply.status(400).send({ error: 'Invalid or expired verification link.' });
    const verified = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(authTokens).set({ usedAt: now })
        .where(and(eq(authTokens.id, token.id), isNull(authTokens.usedAt), gt(authTokens.expiresAt, now)))
        .returning({ userId: authTokens.userId });
      if (!claimed) return false;
      await tx.update(webCredentials).set({ emailVerifiedAt: now }).where(eq(webCredentials.userId, claimed.userId));
      await tx.update(authTokens).set({ usedAt: now })
        .where(and(eq(authTokens.userId, claimed.userId), eq(authTokens.purpose, 'email_verification'), isNull(authTokens.usedAt)));
      return true;
    });
    return verified ? reply.send({ ok: true }) : reply.status(400).send({ error: 'Invalid or expired verification link.' });
  });

  fastify.post('/auth/web/password-reset/request', {
    schema: { tags: ['Authentication'], summary: 'Request a password reset', body: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } }, additionalProperties: false } },
    config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = WebLoginSchema.pick({ email: true }).safeParse(request.body);
    if (!parsed.success) return reply.send({ ok: true });
    const [credential] = await db.select({ userId: webCredentials.userId, emailVerifiedAt: webCredentials.emailVerifiedAt })
      .from(webCredentials).where(eq(webCredentials.email, parsed.data.email)).limit(1);
    if (credential?.emailVerifiedAt) {
      try {
        await sendPasswordResetEmail(parsed.data.email, credential.userId);
      } catch (mailError) {
        request.log.error({ err: mailError, requestId: request.id }, 'Password reset email delivery failed.');
      }
    }
    return reply.send({ ok: true });
  });

  fastify.post('/auth/web/password-reset/complete', {
    schema: { tags: ['Authentication'], summary: 'Reset a web account password', body: { type: 'object', required: ['token', 'password', 'confirmPassword'], properties: { token: { type: 'string', minLength: 32, maxLength: 256 }, password: { type: 'string', minLength: 12, maxLength: 72 }, confirmPassword: { type: 'string', minLength: 12, maxLength: 72 } }, additionalProperties: false } },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = WebPasswordResetSchema.safeParse(request.body);
    if (!parsed.success || Buffer.byteLength(parsed.data?.password ?? '', 'utf8') > 72) {
      return reply.status(400).send({ error: 'Invalid or expired reset link, or the new password is not acceptable.' });
    }
    const now = new Date();
    const [token] = await db.select().from(authTokens).where(and(
      eq(authTokens.tokenHash, hashOpaqueToken(parsed.data.token)),
      eq(authTokens.purpose, 'password_reset'),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, now),
    )).limit(1);
    if (!token) return reply.status(400).send({ error: 'Invalid or expired reset link.' });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const reset = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(authTokens).set({ usedAt: now })
        .where(and(eq(authTokens.id, token.id), isNull(authTokens.usedAt), gt(authTokens.expiresAt, now)))
        .returning({ userId: authTokens.userId });
      if (!claimed) return false;
      await tx.update(webCredentials).set({ passwordHash }).where(eq(webCredentials.userId, claimed.userId));
      await tx.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, claimed.userId));
      await tx.update(authTokens).set({ usedAt: now })
        .where(and(eq(authTokens.userId, claimed.userId), isNull(authTokens.usedAt)));
      return true;
    });
    return reset ? reply.send({ ok: true }) : reply.status(400).send({ error: 'Invalid or expired reset link.' });
  });


  fastify.post('/auth/account/delete', {
    schema: { tags: ['Authentication'], summary: 'Delete account and personal data', security: [{ bearerAuth: [] }], body: { type: 'object', required: ['confirm'], properties: { confirm: { type: 'string', enum: ['DELETE'] }, password: { type: 'string', maxLength: 72 }, initData: { type: 'string', maxLength: 8192 } }, additionalProperties: false } },
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    let claims: { id: string; telegramId?: number | null; authProvider?: string };
    try { claims = await request.jwtVerify(); }
    catch { return reply.status(401).send({ error: 'Authentication required.' }); }
    const body = request.body as { confirm?: string; password?: string; initData?: string } | null;
    if (body?.confirm !== 'DELETE') return reply.status(400).send({ error: 'Explicit DELETE confirmation is required.' });
    if (claims.authProvider === 'web') {
      const [credential] = await db.select({ passwordHash: webCredentials.passwordHash }).from(webCredentials).where(eq(webCredentials.userId, claims.id)).limit(1);
      if (!credential || !body.password || !await bcrypt.compare(body.password, credential.passwordHash)) return reply.status(401).send({ error: 'Password confirmation failed.' });
    } else {
      if (!BOT_TOKEN || !body.initData) return reply.status(401).send({ error: 'Fresh Telegram confirmation is required.' });
      try {
        const tg = verifyTelegramInitData(body.initData, BOT_TOKEN);
        const [identity] = await db.select({ userId: identities.userId }).from(identities)
          .where(and(eq(identities.provider, 'telegram'), eq(identities.providerUid, String(tg.id)), eq(identities.userId, claims.id))).limit(1);
        if (!identity || (claims.telegramId && claims.telegramId !== tg.id)) return reply.status(401).send({ error: 'Telegram account confirmation failed.' });
      } catch { return reply.status(401).send({ error: 'Telegram account confirmation failed.' }); }
    }
    const photos = await db.select({ imageKey: photoAssets.imageKey }).from(photoAssets).where(eq(photoAssets.userId, claims.id));
    try { await removePhotoObjects(photos.map((photo) => photo.imageKey)); }
    catch (error) {
      request.log.error({ err: error, userId: claims.id }, 'Account deletion stopped because photo storage cleanup failed.');
      return reply.status(503).send({ error: 'Photo cleanup is unavailable; retry account deletion later.', requestId: request.id });
    }
    await db.transaction(async (tx) => {
      await tx.delete(swipes).where(or(eq(swipes.fromId, claims.id), eq(swipes.toId, claims.id)));
      await tx.delete(events).where(eq(events.userId, claims.id));
      await tx.delete(userAchievements).where(eq(userAchievements.userId, claims.id));
      await tx.delete(supportMessages).where(eq(supportMessages.authorUserId, claims.id));
      await tx.update(users).set({ referredByUserId: null, lastPassProfileId: null }).where(eq(users.referredByUserId, claims.id));
      await tx.update(paymentIntents).set({ userId: null, telegramUserId: 'deleted', meta: {} }).where(eq(paymentIntents.userId, claims.id));
      await tx.delete(users).where(eq(users.id, claims.id));
    });
    request.log.info({ userId: claims.id }, 'Account deleted by account owner.');
    return reply.send({ ok: true });
  });

  const openApiDocument = appendTrpcOpenApiPaths({
    openapi: '3.0.3',
    info: {
      title: 'Constella API',
      version: '1.0.0',
      description: 'REST auth/payment endpoints and the typed tRPC application API. Purchases use Telegram Stars (XTR).',
    },
    servers: [{ url: process.env.API_PUBLIC_URL || '/api', description: 'API through the web origin proxy' }],
    tags: [
      { name: 'Health', description: 'Liveness and readiness probes.' },
      { name: 'Authentication', description: 'Telegram and standalone account sign-in.' },
      { name: 'Payments', description: 'Internal bot-to-API Telegram Stars callbacks.' },
      { name: 'Blog', description: 'Public post reads for the landing site and the content admin.' },
      { name: 'tRPC', description: 'Typed application procedures. Queries use GET; mutations use POST.' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        paymentsToken: { type: 'apiKey', in: 'header', name: 'x-payments-token' },
      },
    },
    paths: {
      '/health/live': { get: { tags: ['Health'], summary: 'Liveness probe', responses: { '200': { description: 'The API process is running.' } } } },
      '/health/ready': { get: { tags: ['Health'], summary: 'Readiness probe', responses: { '200': { description: 'The API and database are ready.' }, '503': { description: 'The database is unavailable.' } } } },
      '/healthcheck': { get: { tags: ['Health'], summary: 'Legacy liveness probe', responses: { '200': { description: 'The API process is running.' } } } },
      '/auth/account/delete': { post: { tags: ['Authentication'], summary: 'Delete account and personal data', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['confirm'], properties: { confirm: { type: 'string', enum: ['DELETE'] }, password: { type: 'string' }, initData: { type: 'string' } } } } } }, responses: { '200': { description: 'Account and profile data deleted.' }, '401': { description: 'Authentication or ownership confirmation failed.' }, '503': { description: 'Photo storage cleanup failed; retry later.' } } } },
      '/auth/telegram': { post: { tags: ['Authentication'], summary: 'Authenticate Telegram Mini App initData', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['initData'], properties: { initData: { type: 'string' } } } } } }, responses: { '200': { description: 'Bearer JWT and account ID.' }, '401': { description: 'Telegram signature validation failed.' } } } },
      '/auth/web/register': { post: { tags: ['Authentication'], summary: 'Register a browser account', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password', 'confirmPassword', 'acceptedTerms'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 12, maxLength: 72 }, confirmPassword: { type: 'string', minLength: 12, maxLength: 72 }, acceptedTerms: { type: 'boolean', enum: [true] } } } } } }, responses: { '201': { description: 'Account and Bearer JWT created.' }, '409': { description: 'Email is already registered.' } } } },
      '/auth/web/login': { post: { tags: ['Authentication'], summary: 'Sign in to browser account', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', maxLength: 72 } } } } } }, responses: { '200': { description: 'Bearer JWT and account ID.' }, '401': { description: 'Credentials are incorrect.' } } } },
      '/auth/web/verification/resend': { post: { tags: ['Authentication'], summary: 'Resend email verification', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } }, responses: { '200': { description: 'Generic response to prevent account enumeration.' }, '429': { description: 'Rate limit exceeded.' } } } },
      '/auth/web/verification/complete': { post: { tags: ['Authentication'], summary: 'Verify email address', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } } } }, responses: { '200': { description: 'Email verified.' }, '400': { description: 'Token is invalid, expired, or already used.' } } } },
      '/auth/web/password-reset/request': { post: { tags: ['Authentication'], summary: 'Request password reset', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } }, responses: { '200': { description: 'Generic response to prevent account enumeration.' }, '429': { description: 'Rate limit exceeded.' } } } },
      '/auth/web/password-reset/complete': { post: { tags: ['Authentication'], summary: 'Set a new password', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token', 'password', 'confirmPassword'], properties: { token: { type: 'string' }, password: { type: 'string', minLength: 12, maxLength: 72 }, confirmPassword: { type: 'string', minLength: 12, maxLength: 72 } } } } } }, responses: { '200': { description: 'Password changed and active sessions revoked.' }, '400': { description: 'Invalid password or reset token.' } } } },
      '/internal/payments/pre-checkout': { post: { tags: ['Payments'], summary: 'Validate a Telegram Stars pre-checkout', security: [{ paymentsToken: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['invoicePayload', 'telegramUserId', 'currency', 'totalAmount'], properties: { invoicePayload: { type: 'string' }, telegramUserId: { type: 'integer' }, currency: { type: 'string', enum: ['XTR'] }, totalAmount: { type: 'integer' } } } } } }, responses: { '200': { description: 'Telegram pre-checkout validation result.' }, '401': { description: 'Internal payment token is invalid.' } } } },
      '/internal/payments/successful-payment': { post: { tags: ['Payments'], summary: 'Record a successful Stars payment', security: [{ paymentsToken: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['invoicePayload', 'telegramUserId', 'currency', 'totalAmount', 'telegramPaymentChargeId', 'providerPaymentChargeId'], properties: { invoicePayload: { type: 'string' }, telegramUserId: { type: 'integer' }, currency: { type: 'string', enum: ['XTR'] }, totalAmount: { type: 'integer' }, telegramPaymentChargeId: { type: 'string' }, providerPaymentChargeId: { type: 'string' }, isRecurring: { type: 'boolean' }, isFirstRecurring: { type: 'boolean' }, subscriptionExpirationDate: { type: 'integer' } } } } } }, responses: { '200': { description: 'Payment was recorded or recognized as a duplicate.' }, '409': { description: 'Payment did not match a valid invoice.' } } } },
      '/internal/users/{telegramUserId}/status': { get: { tags: ['Payments'], summary: 'Read account entitlement state', security: [{ paymentsToken: [] }], parameters: [{ name: 'telegramUserId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Linked state, VIP, balance and streak information.' }, '401': { description: 'Internal payment token is invalid.' } } } },
      '/blog/posts': { get: { tags: ['Blog'], summary: 'List published posts in one language', parameters: [{ name: 'locale', in: 'query', schema: { type: 'string', enum: ['uk', 'en', 'de', 'fr'], default: 'uk' } }, { name: 'tag', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 } }, { name: 'cursor', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Keyset page of post summaries; never includes the body or noindex.' } } } },
      '/blog/posts/{slug}': { get: { tags: ['Blog'], summary: 'Read one published post with its hreflang alternates', parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }, { name: 'locale', in: 'query', schema: { type: 'string', enum: ['uk', 'en', 'de', 'fr'], default: 'uk' } }], responses: { '200': { description: 'Post body as Markdown plus published siblings in other languages.' }, '404': { description: 'No published post with that slug in that language.' } } } },
      '/blog/tags': { get: { tags: ['Blog'], summary: 'Tags used by published posts', parameters: [{ name: 'locale', in: 'query', schema: { type: 'string', enum: ['uk', 'en', 'de', 'fr'], default: 'uk' } }], responses: { '200': { description: 'Tag counts, most used first.' } } } },
      '/blog/sitemap': { get: { tags: ['Blog'], summary: 'Every published post in every language', responses: { '200': { description: 'Rows for the landing sitemap and RSS generators.' } } } },
      '/blog/admin/session': { get: { tags: ['Blog'], summary: 'Confirm the admin session against the account row', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Actor user id for the signed-in editor.' }, '401': { description: 'Missing, expired or revoked token.' }, '403': { description: 'Account is not an configured admin.' } } } },
      '/blog/admin/posts': { get: { tags: ['Blog'], summary: 'List posts including drafts', security: [{ bearerAuth: [] }], parameters: [{ name: 'locale', in: 'query', schema: { type: 'string', enum: ['uk', 'en', 'de', 'fr'] } }, { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published', 'archived'] } }, { name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } }, { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }], responses: { '200': { description: 'Admin page of posts with SEO fields.' } } }, post: { tags: ['Blog'], summary: 'Create a draft post', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['locale', 'slug', 'title', 'excerpt', 'bodyMarkdown'], properties: { locale: { type: 'string', enum: ['uk', 'en', 'de', 'fr'] }, groupId: { type: 'string', format: 'uuid' }, slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,198}[a-z0-9]$' }, title: { type: 'string', maxLength: 200 }, excerpt: { type: 'string', maxLength: 500 }, bodyMarkdown: { type: 'string', maxLength: 120000 }, tags: { type: 'array', maxItems: 8, items: { type: 'string' } }, coverUrl: { type: 'string', format: 'uri' }, coverAlt: { type: 'string', description: 'Required whenever coverUrl is set.' }, seoTitle: { type: 'string' }, seoDescription: { type: 'string' }, ogImageUrl: { type: 'string' }, canonicalUrl: { type: 'string' }, noindex: { type: 'boolean' }, authorName: { type: 'string' } } } } }, responses: { '201': { description: 'Draft created and audited.' }, '400': { description: 'Validation failed.' }, '409': { description: 'Slug already used in that language.' } } } } },
      '/blog/admin/posts/{id}': { get: { tags: ['Blog'], summary: 'Read one post with its body and translations', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Full row plus sibling locales.' }, '404': { description: 'Post not found.' } } }, patch: { tags: ['Blog'], summary: 'Update post content or SEO fields', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: 'Any subset of the create body except locale and groupId; an empty string clears an optional field.' } } } }, responses: { '200': { description: 'Updated row; readingMinutes is recomputed from the body.' }, '409': { description: 'Slug already used in that language.' } } }, delete: { tags: ['Blog'], summary: 'Delete a post and its cover object', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Row deleted and audited.' } } } },
      '/blog/admin/posts/{id}/status': { post: { tags: ['Blog'], summary: 'Publish, unpublish or archive with an audit reason', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status', 'reason'], properties: { status: { type: 'string', enum: ['draft', 'published', 'archived'] }, reason: { type: 'string', minLength: 8, maxLength: 500 } } } } } }, responses: { '200': { description: 'New state. First publish sets publishedAt; re-publishing keeps it.' } } } },
      '/blog/admin/posts/{id}/translations': { post: { tags: ['Blog'], summary: 'Seed a translation of an existing post', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['locale'], properties: { locale: { type: 'string', enum: ['uk', 'en', 'de', 'fr'] } } } } } }, responses: { '201': { description: 'Draft sibling sharing the group, body empty.' }, '409': { description: 'That language already exists in the group.' } } } },
      '/blog/admin/covers': { post: { tags: ['Blog'], summary: 'Signed PUT URL for a cover upload', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['contentType'], properties: { contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] } } } } } }, responses: { '200': { description: 'Presigned upload target.' }, '503': { description: 'Object storage is not configured; paste an image URL instead.' } } } },
      '/blog/admin/covers/confirm': { post: { tags: ['Blog'], summary: 'Normalise an uploaded cover and return its public URL', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['objectKey', 'contentType'], properties: { objectKey: { type: 'string' }, contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] } } } } } }, responses: { '200': { description: '1200x630 WebP object key and public URL.' }, '400': { description: 'Uploaded bytes are not a usable image.' } } } },
    },
  });
  const swaggerHtml = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Constella API — Swagger</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script><script>window.onload=()=>SwaggerUIBundle({url:window.location.pathname.replace(/\\/$/, '')+'/json',dom_id:'#swagger-ui',deepLinking:true,displayRequestDuration:true});</script></body></html>`;
  fastify.get('/openapi.json', { schema: { hide: true } }, async () => openApiDocument);
  fastify.get('/docs/json', { schema: { hide: true } }, async () => openApiDocument);
  fastify.get('/docs', { schema: { hide: true } }, async (_request, reply) => reply.type('text/html; charset=utf-8').header('cache-control', 'public, max-age=300').send(swaggerHtml));
  fastify.get('/docs/', { schema: { hide: true } }, async (_request, reply) => reply.type('text/html; charset=utf-8').send(swaggerHtml));
  fastify.get('/realtime/stream', {
    schema: { hide: true },
  }, async (request, reply) => {
    const token = (request.query as { token?: string })?.token || (request.headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (!token) return reply.status(401).send({ error: 'Token is required' });
    let claims: { id: string };
    try {
      claims = fastify.jwt.verify(token);
    } catch {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ userId: claims.id, time: new Date().toISOString() })}\n\n`);

    const interval = setInterval(() => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`event: ping\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);
      }
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(interval);
    });
  });

  const stopScheduler = process.env.VERCEL === '1' ? undefined : startBackgroundScheduler(db);
  fastify.addHook('onClose', async () => {
    stopScheduler?.();
    await closeDb();
    await closeSentry();
  });

  await fastify.ready();
}

async function startServer() {
  await initialize();
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    logger.info(`Constella API is running on http://localhost:${PORT}`);
    logger.info(`tRPC endpoint: http://localhost:${PORT}/trpc`);
  } catch (err) {
    fastify.log.error({ err }, 'API failed to listen');
    process.exit(1);
  }
}

let initialization: Promise<void> | undefined;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  initialization ??= initialize();
  await initialization;
  fastify.server.emit('request', request, response);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startServer().catch((error) => {
    fastify.log.error({ err: error }, 'API startup failed');
    process.exitCode = 1;
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    fastify.log.info({ signal }, 'Shutting down API');
    void fastify.close().catch((error) => {
      fastify.log.error({ err: error, signal }, 'Graceful shutdown failed');
      process.exitCode = 1;
    });
  });
}

export { appRouter };
export type { AppRouter } from './routers/_app.js';