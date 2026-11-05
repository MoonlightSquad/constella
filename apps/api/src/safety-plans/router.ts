import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { meetingPlans } from '@constella/db';
import { z } from 'zod';

import { getMatchForUser } from '../engine/core.js';
import { protectedProcedure, router } from '../trpc.js';

const noContactDetails = (value: string) =>
  !/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i.test(value) &&
  !/(?<!\w)(?:\+?\d[\d ()-]{6,}\d)(?!\w)/.test(value);

export const safetyPlanFields = z.object({
  matchId: z.string().uuid(),
  startsAt: z.string().datetime(),
  venueName: z.string().trim().min(2).max(100).refine(noContactDetails),
  city: z.string().trim().min(2).max(80).refine(noContactDetails),
}).superRefine((input, ctx) => {
  const startsAt = new Date(input.startsAt).getTime();
  const now = Date.now();
  if (startsAt < now + 5 * 60_000 || startsAt > now + 365 * 24 * 60 * 60_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startsAt'], message: 'Choose a time between five minutes and one year from now.' });
  }
});

export const safetyPlanRouter = router({
  get: protectedProcedure
    .input(z.object({ matchId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await getMatchForUser(ctx.db, input.matchId, ctx.user.id);
      const [plan] = await ctx.db
        .select()
        .from(meetingPlans)
        .where(and(eq(meetingPlans.matchId, input.matchId), eq(meetingPlans.userId, ctx.user.id)))
        .limit(1);
      return plan ?? null;
    }),

  save: protectedProcedure
    .input(safetyPlanFields)
    .mutation(async ({ ctx, input }) => {
      await getMatchForUser(ctx.db, input.matchId, ctx.user.id);
      const [plan] = await ctx.db
        .insert(meetingPlans)
        .values({
          matchId: input.matchId,
          userId: ctx.user.id,
          startsAt: new Date(input.startsAt),
          venueName: input.venueName,
          city: input.city,
        })
        .onConflictDoUpdate({
          target: [meetingPlans.matchId, meetingPlans.userId],
          set: {
            startsAt: new Date(input.startsAt),
            venueName: input.venueName,
            city: input.city,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!plan) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not save your private safety plan.' });
      return plan;
    }),

  remove: protectedProcedure
    .input(z.object({ matchId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await getMatchForUser(ctx.db, input.matchId, ctx.user.id);
      await ctx.db
        .delete(meetingPlans)
        .where(and(eq(meetingPlans.matchId, input.matchId), eq(meetingPlans.userId, ctx.user.id)));
      return { ok: true };
    }),
});
