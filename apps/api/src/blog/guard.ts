import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, users } from '@constella/db';
import { isAdminAccount, type UserPayload } from '../trpc.js';

export type AdminAuth =
  | { ok: true; claims: UserPayload }
  | { ok: false; status: 401 | 403; error: string };

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 200;

const NOT_ADMIN = 'Admin access is not configured for this account.';
const RESTRICTED = 'This account is currently restricted.';

/**
 * `sessionVersion`, `bannedAt` and `role` are not expressible in a signed JWT, so a token
 * stays valid until the account row says otherwise. The cache is the compromise: a logout,
 * a ban or a revoked admin takes at most a minute to reach an open admin session, while a
 * single editor page load (session + list + preview) costs one database read. The denial
 * text is cached too, so a revoked editor is not told they were banned.
 */
const decisions = new Map<string, { checkedAt: number; allowed: boolean; denial?: string }>();

const cachedDecision = (userId: string) => {
  const hit = decisions.get(userId);
  if (!hit) return null;
  if (Date.now() - hit.checkedAt > CACHE_TTL_MS) {
    decisions.delete(userId);
    return null;
  }
  return hit;
};

const rememberDecision = (userId: string, allowed: boolean, denial?: string) => {
  if (decisions.size >= CACHE_MAX_ENTRIES) decisions.clear();
  decisions.set(userId, { checkedAt: Date.now(), allowed, denial });
};

export const invalidateAdminSession = (userId: string) => {
  decisions.delete(userId);
};

export const requireAdminAuth = async (fastify: FastifyInstance, request: FastifyRequest): Promise<AdminAuth> => {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing bearer token.' };
  }

  let claims: UserPayload;
  try {
    claims = fastify.jwt.verify<UserPayload>(header.slice('Bearer '.length).trim());
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired token.' };
  }
  if (!claims?.id || typeof claims.id !== 'string') {
    return { ok: false, status: 401, error: 'Invalid or expired token.' };
  }

  const cached = cachedDecision(claims.id);
  if (cached?.allowed === true) return { ok: true, claims };
  if (cached?.allowed === false) return { ok: false, status: 403, error: cached.denial ?? NOT_ADMIN };

  const [account] = await db
    .select({ sessionVersion: users.sessionVersion, bannedAt: users.bannedAt, role: users.role })
    .from(users)
    .where(eq(users.id, claims.id))
    .limit(1);
  if (!account) return { ok: false, status: 401, error: 'Invalid or expired token.' };
  if ((claims.sessionVersion ?? 0) !== account.sessionVersion) {
    return { ok: false, status: 401, error: 'Session revoked. Sign in again.' };
  }
  if (account.bannedAt) {
    rememberDecision(claims.id, false, RESTRICTED);
    return { ok: false, status: 403, error: RESTRICTED };
  }
  if (!isAdminAccount(claims, account.role)) {
    rememberDecision(claims.id, false, NOT_ADMIN);
    return { ok: false, status: 403, error: NOT_ADMIN };
  }

  rememberDecision(claims.id, true);
  return { ok: true, claims };
};
