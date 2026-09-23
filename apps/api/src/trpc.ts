import { initTRPC, TRPCError } from '@trpc/server';
import { CreateFastifyContextOptions } from '@fastify/trpc';
import { db } from '@constella/db';

export interface UserPayload {
  id: string;
  telegramId: number;
}

export const createContext = async ({ req, res }: CreateFastifyContextOptions) => {
  let user: UserPayload | null = null;

  try {
    // req.jwtVerify доступний завдяки @fastify/jwt
    user = await req.jwtVerify<UserPayload>();
  } catch (err) {
    // Токен відсутній або недійсний
  }

  return {
    req,
    res,
    db,
    user,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware для захищених роутів
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Автоматично виводить тип як non-null UserPayload
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);