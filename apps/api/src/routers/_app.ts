import { router, publicProcedure, protectedProcedure } from '../trpc.js';

export const appRouter = router({
  // Публічна процедура
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok' };
  }),

  // Захищена процедура (доступна лише з JWT-токеном)
  me: protectedProcedure.query(async ({ ctx }) => {
    return {
      userId: ctx.user.id,
      telegramId: ctx.user.telegramId,
    };
  }),
});

export type AppRouter = typeof appRouter;