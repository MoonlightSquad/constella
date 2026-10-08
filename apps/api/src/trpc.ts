import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db, users } from '@constella/db';
import { eq } from 'drizzle-orm';

export interface UserPayload {
  id: string;
  telegramId: number | null;
  authProvider?: 'telegram' | 'web';
  sessionVersion?: number;
}

export interface Context {
  req: FastifyRequest;
  res: FastifyReply;
  db: any;
  user: UserPayload | null;
}

export const createContext = async ({ req, res }: CreateFastifyContextOptions): Promise<Context> => {
  let user: UserPayload | null = null;

  try {
    user = await req.jwtVerify<UserPayload>();
  } catch {
    // Token missing or invalid
  }

  return {
    req,
    res,
    db,
    user,
  };
};

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware для захищених роутів
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  const [account] = await ctx.db.select({
    bannedAt: users.bannedAt, sessionVersion: users.sessionVersion,
  }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
  if (!account || (ctx.user.sessionVersion ?? 0) !== account.sessionVersion) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session is no longer valid.' });
  }
  if (account.bannedAt && !isConfiguredAdmin(ctx.user)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This account is currently restricted.' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Автоматично виводить тип як non-null UserPayload
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);

const configuredAdminIds = (key: 'ADMIN_USER_IDS' | 'ADMIN_TELEGRAM_IDS') =>
  new Set((process.env[key] ?? '').split(',').map((value) => value.trim()).filter(Boolean));

export const isConfiguredAdmin = (user: UserPayload | null) => {
  if (!user) return false;
  const userIds = configuredAdminIds('ADMIN_USER_IDS');
  const telegramIds = configuredAdminIds('ADMIN_TELEGRAM_IDS');
  return userIds.has(user.id) || (user.telegramId !== null && telegramIds.has(String(user.telegramId)));
};

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isConfiguredAdmin(ctx.user)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access is not configured for this account.' });
  }
  return next({ ctx });
});
