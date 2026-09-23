import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { fastifyTRPCPlugin } from '@fastify/trpc';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, users, identities } from '@constella/db';
import { eq, and } from 'drizzle-orm';
import { AuthRequestSchema } from '@constella/shared';
import { verifyTelegramInitData } from './utils/telegram.js';
import { appRouter, type AppRouter } from './routers/_app.js';
import { createContext } from './trpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../../.env') });

const fastify = Fastify({ logger: true });

const PORT = Number(process.env.PORT) || 4000;
const BOT_TOKEN = process.env.BOT_TOKEN || 'test_bot_token';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_constella';

async function bootstrap() {
  await fastify.register(cors, { origin: '*' });

  await fastify.register(jwt, {
    secret: JWT_SECRET,
    sign: { expiresIn: '30d' },
  });

  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
    },
  });

  fastify.post('/auth/telegram', async (request, reply) => {
    try {
      const parsedBody = AuthRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }

      const tgUser = verifyTelegramInitData(parsedBody.data.initData, BOT_TOKEN);

      let [identity] = await db
        .select()
        .from(identities)
        .where(and(eq(identities.provider, 'telegram'), eq(identities.providerUid, String(tgUser.id))))
        .limit(1);

      let userId = identity?.userId;

      if (!userId) {
        const [newUser] = await db
          .insert(users)
          .values({
            birthdate: new Date('2000-01-01'),
            gender: 'none',
            lookingFor: [],
          })
          .returning();

        userId = newUser.id;

        await db.insert(identities).values({
          provider: 'telegram',
          providerUid: String(tgUser.id),
          userId: newUser.id,
        });
      }

      const token = fastify.jwt.sign({ id: userId, telegramId: tgUser.id });

      return reply.send({ token, userId });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(401).send({ error: 'Authentication failed', details: err.message });
    }
  });

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`🚀 Constella API is running on http://localhost:${PORT}`);
    fastify.log.info(`📡 tRPC endpoint: http://localhost:${PORT}/trpc`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();

export type { AppRouter };