import { createHash, randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, eq, gt, or, sql } from 'drizzle-orm';
import {
  blockedUsers,
  events,
  gifts,
  identities,
  matches,
  questProgress,
  userAchievements,
  userBoosts,
  userEntitlements,
  users,
} from '@constella/db';
import {
  ACHIEVEMENTS,
  DAILY_QUESTS,
  FREE_DAILY_LIKES,
  STREAK_REWARDS,
  XP_PER_LEVEL,
  getZodiac,
  isVipPlan,
} from '@constella/shared';

export const getAge = (birthdate: Date) => {
  const now = new Date();
  let age = now.getFullYear() - birthdate.getFullYear();
  if (now.getMonth() < birthdate.getMonth() || (now.getMonth() === birthdate.getMonth() && now.getDate() < birthdate.getDate())) {
    age -= 1;
  }
  return age;
};

export const getLocalDate = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const getLocalHour = (timeZone: string) =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .find((part) => part.type === 'hour')?.value ?? '0'
  );

export const interestScore = (a: string[] = [], b: string[] = []) => {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  const hits = b.filter((tag) => set.has(tag)).length;
  return Math.round((hits / Math.max(a.length, b.length)) * 100);
};

export const effectivePoint = (user: {
  latitude?: number | null;
  longitude?: number | null;
  locationOverrideLat?: number | null;
  locationOverrideLng?: number | null;
}) => {
  if (user.locationOverrideLat != null && user.locationOverrideLng != null) {
    return { lat: user.locationOverrideLat, lng: user.locationOverrideLng };
  }
  if (user.latitude != null && user.longitude != null) {
    return { lat: user.latitude, lng: user.longitude };
  }
  return null;
};

export const toPublicProfile = (profile: Record<string, any>, viewerInterests: string[] = [], distanceKm?: number | null) => ({
  id: profile.id,
  displayName: profile.displayName || 'Нове знайомство',
  age: getAge(profile.birthdate),
  gender: profile.gender,
  city: profile.locationOverrideCity || profile.city,
  bio: profile.bio,
  quote: profile.quote,
  photos: profile.photos ?? [],
  prompts: [profile.promptOne, profile.promptTwo, profile.promptThree].filter(Boolean),
  interests: profile.interests ?? [],
  verified: Boolean(profile.verifiedAt),
  level: profile.level ?? 1,
  zodiac: getZodiac(new Date(profile.birthdate)),
  matchPercent: interestScore(viewerInterests, profile.interests ?? []),
  distanceKm: distanceKm ?? null,
  badges: profile.badges ?? [],
  boosted: Boolean(profile.boosted),
  vip: Boolean(profile.vip),
});

export const requireCompleteProfile = async (db: any, userId: string) => {
  const [profile] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!profile?.onboardingCompletedAt) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Complete your profile first.' });
  }
  if (profile.bannedAt) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This account is suspended.' });
  }
  return profile;
};

export const hasVip = async (db: any, userId: string) => {
  const [entitlement] = await db
    .select()
    .from(userEntitlements)
    .where(eq(userEntitlements.userId, userId))
    .limit(1);
  const active = entitlement && entitlement.expiresAt > new Date() && entitlement.status !== 'expired';
  if (entitlement && !active && entitlement.status !== 'expired') {
    await db.update(userEntitlements).set({ status: 'expired', updatedAt: new Date() }).where(eq(userEntitlements.userId, userId));
  }
  return Boolean(active && isVipPlan(entitlement.plan));
};

export const blockedIds = async (db: any, userId: string) => {
  const [outgoing, incoming] = await Promise.all([
    db.select({ id: blockedUsers.blockedUserId }).from(blockedUsers).where(eq(blockedUsers.userId, userId)),
    db.select({ id: blockedUsers.userId }).from(blockedUsers).where(eq(blockedUsers.blockedUserId, userId)),
  ]);
  return [...outgoing, ...incoming].map((row: { id: string }) => row.id);
};

export const grantXp = async (db: any, userId: string, amount: number) => {
  await db
    .update(users)
    .set({
      xp: sql`${users.xp} + ${amount}`,
      level: sql`GREATEST(1, floor((${users.xp} + ${amount}) / ${XP_PER_LEVEL}.0)::int + 1)`,
    })
    .where(eq(users.id, userId));
};

export const awardAchievement = async (db: any, userId: string, code: string) => {
  const definition = ACHIEVEMENTS.find((item) => item.code === code);
  const [earned] = await db
    .insert(userAchievements)
    .values({ userId, code })
    .onConflictDoNothing()
    .returning({ code: userAchievements.code });
  if (earned && definition) await grantXp(db, userId, definition.xp);
  return Boolean(earned);
};

export const bumpQuest = async (db: any, userId: string, timeZone: string, code: string, amount = 1) => {
  const quest = DAILY_QUESTS.find((item) => item.code === code);
  if (!quest) return;
  const periodKey = getLocalDate(timeZone);
  const [row] = await db
    .insert(questProgress)
    .values({ userId, code, periodKey, progress: amount })
    .onConflictDoUpdate({
      target: [questProgress.userId, questProgress.code, questProgress.periodKey],
      set: { progress: sql`${questProgress.progress} + ${amount}` },
    })
    .returning();
  if (row && !row.completedAt && row.progress >= quest.target) {
    await db
      .update(questProgress)
      .set({ completedAt: new Date() })
      .where(and(eq(questProgress.userId, userId), eq(questProgress.code, code), eq(questProgress.periodKey, periodKey)));
    await grantXp(db, userId, quest.xp);
  }
};

const dateShift = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const touchStreakAndPresence = async (db: any, profile: any) => {
  const today = getLocalDate(profile.timeZone);
  const hour = getLocalHour(profile.timeZone);
  const updates: Record<string, unknown> = { lastActiveAt: new Date() };
  let streak = profile.streakCount ?? 0;
  if (profile.streakUpdatedOn !== today) {
    if (profile.streakUpdatedOn === dateShift(today, -1)) {
      streak += 1;
    } else if (profile.streakUpdatedOn && (profile.streakFreezes ?? 0) > 0) {
      streak = Math.max(streak, 1);
      updates.streakFreezes = Math.max(0, (profile.streakFreezes ?? 0) - 1);
    } else {
      streak = 1;
    }
    updates.streakCount = streak;
    updates.streakUpdatedOn = today;
    const reward = STREAK_REWARDS[streak];
    if (reward?.superlikes) updates.superlikeBalance = sql`${users.superlikeBalance} + ${reward.superlikes}`;
    if (reward?.freezes) updates.streakFreezes = sql`COALESCE(${users.streakFreezes}, 0) + ${reward.freezes}`;
    if (reward?.vipHours) {
      const extra = new Date(Date.now() + reward.vipHours * 3600_000);
      const [current] = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, profile.id)).limit(1);
      const expiresAt = current?.expiresAt > extra ? current.expiresAt : extra;
      await db
        .insert(userEntitlements)
        .values({
          userId: profile.id,
          plan: 'vip',
          source: 'stars',
          status: 'active',
          startsAt: current?.startsAt ?? new Date(),
          expiresAt,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userEntitlements.userId,
          set: { plan: 'vip', status: 'active', expiresAt, cancelledAt: null, updatedAt: new Date() },
        });
    }
    if (streak >= 7) await awardAchievement(db, profile.id, 'streak-7');
  }
  await db.update(users).set(updates).where(eq(users.id, profile.id));
  if (hour >= 23) await awardAchievement(db, profile.id, 'owl');
  if (hour < 7) await awardAchievement(db, profile.id, 'early-bird');
  return { ...profile, ...updates, streakCount: streak };
};

export const referralCodeFor = (userId: string) =>
  createHash('sha1').update(userId).digest('hex').slice(0, 8);

export const issueRefreshToken = () => randomBytes(48).toString('hex');

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const applyPurchase = async (
  db: any,
  userId: string,
  sku: string,
  meta: Record<string, unknown> = {},
  chargeId?: string,
  expiresAt?: Date
) => {
  const now = new Date();
  if (sku === 'vip' || sku === 'plus' || sku === 'prime') {
    const [current] = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, userId)).limit(1);
    const expiration = expiresAt ?? new Date(now.getTime() + 30 * 24 * 3600_000);
    await db
      .insert(userEntitlements)
      .values({
        userId,
        plan: sku === 'plus' || sku === 'prime' ? 'vip' : sku,
        source: 'stars',
        status: 'active',
        startsAt: current?.startsAt ?? now,
        expiresAt: expiration,
        telegramSubscriptionChargeId: current?.telegramSubscriptionChargeId ?? chargeId,
        cancelledAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userEntitlements.userId,
        set: {
          plan: 'vip',
          source: 'stars',
          status: 'active',
          expiresAt: expiration,
          telegramSubscriptionChargeId: current?.telegramSubscriptionChargeId ?? chargeId,
          cancelledAt: null,
          updatedAt: now,
        },
      });
  } else if (sku === 'boost') {
    await db.insert(userBoosts).values({
      userId,
      startsAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60_000),
    });
  } else if (sku === 'superlike') {
    await db.update(users).set({ superlikeBalance: sql`${users.superlikeBalance} + 1` }).where(eq(users.id, userId));
  } else if (sku === 'freeze') {
    await db.update(users).set({ streakFreezes: sql`${users.streakFreezes} + 1` }).where(eq(users.id, userId));
  } else if (sku.startsWith('gift_') && typeof meta.giftToUserId === 'string') {
    const stars = Number(meta.stars ?? 0);
    await db.insert(gifts).values({ fromId: userId, toId: meta.giftToUserId, sku, stars });
  }
  await grantXp(db, userId, 25);
  await awardAchievement(db, userId, 'star-patron');
  await db.insert(events).values({ userId, type: 'stars_purchase', meta: { sku, ...meta } });
};

export const remainingLikes = (profile: any, vip: boolean) => {
  if (vip) return Number.POSITIVE_INFINITY;
  const today = getLocalDate(profile.timeZone);
  const used = profile.dailyLikesOn === today ? profile.dailyLikesUsed ?? 0 : 0;
  return Math.max(0, FREE_DAILY_LIKES - used);
};

export const telegramIdForUser = async (db: any, userId: string) => {
  const [identity] = await db
    .select({ uid: identities.providerUid })
    .from(identities)
    .where(and(eq(identities.provider, 'telegram'), eq(identities.userId, userId)))
    .limit(1);
  return identity?.uid ?? null;
};

const userVelocityMap = new Map<string, { timestamps: number[]; lastLat?: number; lastLng?: number; lastLocTime?: number }>();

export const checkSwipeVelocityAndSpam = async (
  db: any,
  userId: string,
  location?: { lat: number; lng: number }
) => {
  const now = Date.now();
  let entry = userVelocityMap.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    userVelocityMap.set(userId, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => now - t <= 10_000);
  entry.timestamps.push(now);

  let flaggedReason: string | null = null;
  if (entry.timestamps.length > 25) {
    flaggedReason = 'Abnormal swipe velocity (>25 swipes in 10s)';
  }

  if (location && entry.lastLat != null && entry.lastLng != null && entry.lastLocTime != null) {
    const elapsedSec = (now - entry.lastLocTime) / 1000;
    if (elapsedSec < 300) {
      const dLat = ((location.lat - entry.lastLat) * Math.PI) / 180;
      const dLng = ((location.lng - entry.lastLng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((entry.lastLat * Math.PI) / 180) * Math.cos((location.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (distKm > 500) {
        flaggedReason = `Suspicious GPS jump (${Math.round(distKm)}km in ${Math.round(elapsedSec)}s)`;
      }
    }
  }

  if (location) {
    entry.lastLat = location.lat;
    entry.lastLng = location.lng;
    entry.lastLocTime = now;
  }

  if (flaggedReason) {
    await db.update(users).set({ shadowbannedAt: new Date() }).where(eq(users.id, userId));
    await db.insert(events).values({
      userId,
      type: 'auto_shadowban',
      meta: { reason: flaggedReason, timestamp: new Date().toISOString() },
    });
    return false;
  }
  return true;
};

export const notifyTelegram = async (
  telegramUserId: string,
  text: string,
  options?: { silent?: boolean; userTimeZone?: string }
) => {
  const token = process.env.BOT_TOKEN;
  if (!token) return;
  try {
    let disableNotification = Boolean(options?.silent);
    if (!disableNotification && options?.userTimeZone) {
      const hour = getLocalHour(options.userTimeZone);
      if (hour >= 23 || hour < 8) {
        disableNotification = true;
      }
    }
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramUserId,
        text,
        disable_notification: disableNotification,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // notifications are best-effort
  }
};

export const getMatchForUser = async (db: any, matchId: string, userId: string) => {
  const [match] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.id, matchId), or(eq(matches.userOneId, userId), eq(matches.userTwoId, userId))))
    .limit(1);
  if (!match) throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found.' });
  const peerId = match.userOneId === userId ? match.userTwoId : match.userOneId;
  const [block] = await db
    .select({ userId: blockedUsers.userId })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.userId, userId), eq(blockedUsers.blockedUserId, peerId)),
        and(eq(blockedUsers.userId, peerId), eq(blockedUsers.blockedUserId, userId))
      )
    )
    .limit(1);
  if (block) throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found.' });
  return match;
};

export { gt };
