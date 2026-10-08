import { and, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { events, userBoosts, userEntitlements, users } from '@constella/db';
import { createLogger } from '@constella/shared';
import { getLocalDate, getLocalHour, notifyTelegram, telegramIdForUser } from './core.js';

const logger = createLogger('scheduler');

const dateShift = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const runSchedulerCycle = async (db: any) => {
  try {
    const now = new Date();

    // 1. Clean up expired VIP entitlements
    const expiredVipCount = await db
      .update(userEntitlements)
      .set({ status: 'expired', updatedAt: now })
      .where(and(eq(userEntitlements.status, 'active'), lt(userEntitlements.expiresAt, now)));

    // 2. Clean up expired boosts
    await db.delete(userBoosts).where(lt(userBoosts.expiresAt, now));

    // 3. Process streak resets & reminders for active users
    const candidateUsers = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        timeZone: users.timeZone,
        streakCount: users.streakCount,
        streakUpdatedOn: users.streakUpdatedOn,
        streakFreezes: users.streakFreezes,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.onboardingCompletedAt),
          isNull(users.bannedAt),
          sql`${users.streakCount} > 0`
        )
      )
      .limit(500);

    for (const user of candidateUsers) {
      const today = getLocalDate(user.timeZone);
      const yesterday = dateShift(today, -1);
      const localHour = getLocalHour(user.timeZone);

      // Streak expiration check: if last update was before yesterday, streak is broken
      if (user.streakUpdatedOn && user.streakUpdatedOn < yesterday) {
        if (user.streakFreezes > 0) {
          await db
            .update(users)
            .set({
              streakFreezes: Math.max(0, user.streakFreezes - 1),
              streakUpdatedOn: yesterday,
            })
            .where(eq(users.id, user.id));
        } else {
          await db
            .update(users)
            .set({ streakCount: 0 })
            .where(eq(users.id, user.id));
        }
      }

      // Streak reminder check: if user has an active streak, hasn't updated today,
      // and it's daytime (e.g. 17:00 - 21:00 in their timezone, avoiding night hours 23:00-08:00)
      if (
        user.streakCount > 0 &&
        user.streakUpdatedOn === yesterday &&
        localHour >= 18 &&
        localHour <= 21
      ) {
        const [alreadyReminded] = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.userId, user.id),
              eq(events.type, 'streak_reminder'),
              gte(events.createdAt, new Date(Date.now() - 20 * 3600_000))
            )
          )
          .limit(1);

        if (!alreadyReminded) {
          const telegramId = await telegramIdForUser(db, user.id);
          if (telegramId) {
            await notifyTelegram(
              telegramId,
              `Твій стрік у Constella під загрозою! 🔥 Зазирни сьогодні, щоб не втратити ${user.streakCount} ${user.streakCount === 1 ? 'день' : 'днів'} активності.`,
              { userTimeZone: user.timeZone }
            );
            await db.insert(events).values({
              userId: user.id,
              type: 'streak_reminder',
              meta: { streakCount: user.streakCount, date: today },
            });
          }
        }
      }
    }
  } catch (error) {
    logger.warn('Error during scheduler cycle execution', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const startBackgroundScheduler = (db: any, intervalMs = 15 * 60_000) => {
  logger.info('Background scheduler worker started.');
  // Run once on startup
  void runSchedulerCycle(db);
  const timer = setInterval(() => {
    void runSchedulerCycle(db);
  }, intervalMs);

  return () => {
    clearInterval(timer);
    logger.info('Background scheduler stopped.');
  };
};
