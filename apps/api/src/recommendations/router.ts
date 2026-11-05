import { and, eq } from 'drizzle-orm';
import { dailyOrbitProfiles, recommendationFeedback, users } from '@constella/db';
import { z } from 'zod';

import { getLocalDate } from '../engine/core.js';
import { protectedProcedure, router } from '../trpc.js';

export const recommendationFeedbackSchema = z.object({
  profileId: z.string().uuid(),
  reason: z.enum(['not_interested', 'distance', 'profile_incomplete', 'intent_mismatch', 'other']),
});

export const recommendationsRouter = router({
  feedback: protectedProcedure
    .input(recommendationFeedbackSchema)
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({ timeZone: users.timeZone })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      const today = getLocalDate(user?.timeZone || 'UTC');
      const [candidate] = await ctx.db
        .select({ profileId: dailyOrbitProfiles.profileId })
        .from(dailyOrbitProfiles)
        .where(and(
          eq(dailyOrbitProfiles.userId, ctx.user.id),
          eq(dailyOrbitProfiles.profileId, input.profileId),
          eq(dailyOrbitProfiles.orbitDate, today)
        ))
        .limit(1);
      if (!candidate) return { ok: true };

      await ctx.db
        .insert(recommendationFeedback)
        .values({
          userId: ctx.user.id,
          profileId: input.profileId,
          feedbackDate: today,
          reason: input.reason,
        })
        .onConflictDoUpdate({
          target: [
            recommendationFeedback.userId,
            recommendationFeedback.profileId,
            recommendationFeedback.feedbackDate,
          ],
          set: { reason: input.reason },
        });
      return { ok: true };
    }),
});
