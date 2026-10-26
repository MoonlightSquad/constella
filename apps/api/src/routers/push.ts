import { and, eq } from 'drizzle-orm';
import { pushDevices } from '@constella/db';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';
import { EXPO_TOKEN_RE } from '../push/notify.js';

const pushToken = z.string().regex(EXPO_TOKEN_RE, 'Expected an Expo push token');

export const pushRouter = router({
  registerToken: protectedProcedure
    .input(z.object({ pushToken, platform: z.enum(['ios', 'android']) }))
    .mutation(async ({ ctx, input }) => {
      // Токен глобально унікальний: вийшов з акаунта застосунок має перестати
      // діставати його пуші, тому знімаємо рядок перед реєстрацією.
      await ctx.db.delete(pushDevices).where(eq(pushDevices.pushToken, input.pushToken));
      await ctx.db
        .insert(pushDevices)
        .values({ userId: ctx.user.id, pushToken: input.pushToken, platform: input.platform });
      return { ok: true };
    }),

  unregisterToken: protectedProcedure
    .input(z.object({ pushToken }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(pushDevices)
        .where(and(eq(pushDevices.pushToken, input.pushToken), eq(pushDevices.userId, ctx.user.id)));
      return { ok: true };
    }),
});
