import { TRPCError } from '@trpc/server';
import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { events } from '@constella/db';
import { z } from 'zod';

import { hasVip, getMatchForUser } from '../engine/core.js';
import { protectedProcedure, router } from '../trpc.js';
import { AssistantServiceError, requestSuggestions } from './client.js';

const DAILY_LIMIT = 10;
const localeSchema = z.enum(['uk', 'en', 'de', 'fr']);
const emailOrUrl = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i;
const phoneNumber = /(?<!\w)(?:\+?\d[\d ()-]{6,}\d)(?!\w)/;
const topicSchema = z.string().trim().min(3).max(120)
  .refine((topic) => !emailOrUrl.test(topic) && !phoneNumber.test(topic), 'Topic must not contain contact details.');
const requestSchema = z.object({
  matchId: z.string().uuid(),
  locale: localeSchema,
  topic: topicSchema,
});

const reserveDailyRequest = async (db: any, userId: string): Promise<number> => {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayKey = dayStart.toISOString().slice(0, 10);
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext(${dayKey}))`);
    const [usage] = await tx
      .select({ total: count() })
      .from(events)
      .where(and(
        eq(events.userId, userId),
        eq(events.type, 'ai.assistant.requested'),
        gte(events.createdAt, dayStart),
        lt(events.createdAt, dayEnd)
      ));
    const used = Number(usage?.total ?? 0);
    if (used >= DAILY_LIMIT) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Daily AI suggestion limit reached.' });
    }
    await tx.insert(events).values({
      userId,
      type: 'ai.assistant.requested',
      meta: { day: dayKey },
    });
    return DAILY_LIMIT - used - 1;
  });
};

export const assistantRouter = router({
  status: protectedProcedure.query(() => ({
    enabled: process.env.AI_ASSISTANT_ENABLED === 'true',
  })),

  suggest: protectedProcedure
    .input(requestSchema)
    .mutation(async ({ ctx, input }) => {
      if (process.env.AI_ASSISTANT_ENABLED !== 'true') {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Premium AI suggestions are currently unavailable.' });
      }
      if (!(await hasVip(ctx.db, ctx.user.id))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Premium AI suggestions require an active Premium plan.' });
      }

      await getMatchForUser(ctx.db, input.matchId, ctx.user.id);
      const remaining = await reserveDailyRequest(ctx.db, ctx.user.id);
      try {
        const suggestions = await requestSuggestions({ locale: input.locale, topic: input.topic });
        return { suggestions, remaining };
      } catch (error) {
        if (error instanceof AssistantServiceError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message, cause: error });
        }
        throw error;
      }
    }),
});
