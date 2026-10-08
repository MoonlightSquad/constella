import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import {
  blockedUsers,
  dailyOrbitProfiles,
  contactShares,
  events,
  gifts,
  matches,
  messages,
  questProgress,
  reports,
  swipes,
  userAchievements,
  userBoosts,
  users,
} from '@constella/db';
import { ACHIEVEMENTS, DAILY_QUESTS, FREE_DAILY_LIKES, STAR_PRODUCTS } from '@constella/shared';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import {
  awardAchievement,
  blockedIds,
  bumpQuest,
  grantXp,
  effectivePoint,
  getAge,
  getLocalDate,
  getLocalHour,
  getMatchForUser,
  hasVip,
  notifyTelegram,
  remainingLikes,
  requireCompleteProfile,
  telegramIdForUser,
  toPublicProfile,
  touchStreakAndPresence,
} from '../engine/core.js';

const MAX_MESSAGE_LENGTH = 1000;
const publicProfileFields = {
  id: users.id,
  birthdate: users.birthdate,
  displayName: users.displayName,
  gender: users.gender,
  city: users.city,
  locationOverrideCity: users.locationOverrideCity,
  bio: users.bio,
  quote: users.quote,
  photos: users.photos,
  interests: users.interests,
  promptOne: users.promptOne,
  promptTwo: users.promptTwo,
  promptThree: users.promptThree,
  verifiedAt: users.verifiedAt,
  level: users.level,
  incognitoUntil: users.incognitoUntil,
};

const loadBadges = async (db: any, userIds: string[]) => {
  if (userIds.length === 0) return new Map<string, string[]>();
  const rows = await db
    .select({ userId: userAchievements.userId, code: userAchievements.code })
    .from(userAchievements)
    .where(inArray(userAchievements.userId, userIds));
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push(row.code);
    map.set(row.userId, list);
  }
  return map;
};

const candidateWhere = (profile: any, excludedIds: string[], vipViewer: boolean) => {
  const point = effectivePoint(profile);
  const radiusM = Math.max(1, profile.preferredRadiusKm ?? 50) * 1000;
  const geoFilter = point
    ? sql`${users.geo} IS NOT NULL AND ST_DWithin(${users.geo}, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${radiusM})`
    : sql`${users.city} = ${profile.city}`;
  const ageExpr = sql`EXTRACT(YEAR FROM AGE(${users.birthdate}))`;
  return and(
    ne(users.id, profile.id),
    isNotNull(users.onboardingCompletedAt),
    isNull(users.bannedAt),
    isNull(users.shadowbannedAt),
    inArray(users.gender, profile.lookingFor),
    sql`${profile.gender} = ANY(${users.lookingFor})`,
    sql`${ageExpr} BETWEEN ${profile.ageMin ?? 18} AND ${profile.ageMax ?? 99}`,
    geoFilter,
    excludedIds.length > 0
      ? sql`${users.id} NOT IN (${sql.join(excludedIds.map((id: string) => sql`${id}::uuid`), sql`, `)})`
      : sql`true`,
    vipViewer
      ? sql`true`
      : sql`(${users.incognitoUntil} IS NULL OR ${users.incognitoUntil} < NOW() OR EXISTS (
          SELECT 1 FROM swipes s WHERE s.from_id = ${users.id} AND s.to_id = ${profile.id}::uuid AND s.kind IN ('spark','super')
        ))`
  );
};

const scoreOrder = sql`
  CASE WHEN EXISTS (SELECT 1 FROM user_boosts b WHERE b.user_id = ${users.id} AND b.expires_at > NOW()) THEN 3 ELSE 0 END +
  CASE WHEN EXISTS (SELECT 1 FROM user_entitlements e WHERE e.user_id = ${users.id} AND e.expires_at > NOW() AND e.status <> 'expired') THEN 1 ELSE 0 END +
  CASE WHEN ${users.createdAt} > NOW() - INTERVAL '72 hours' THEN 1 ELSE 0 END
  DESC, ${users.xp} DESC, ${users.createdAt} DESC
`;

const attachMeta = async (db: any, profile: any, rows: any[]) => {
  const ids = rows.map((row) => row.id);
  const [badges, boosts] = await Promise.all([
    loadBadges(db, ids),
    ids.length
      ? db
          .select({ userId: userBoosts.userId })
          .from(userBoosts)
          .where(and(inArray(userBoosts.userId, ids), sql`${userBoosts.expiresAt} > NOW()`))
      : [],
  ]);
  const boosted = new Set(boosts.map((row: { userId: string }) => row.userId));
  const point = effectivePoint(profile);
  return rows.map((row) => {
    let distanceKm: number | null = null;
    if (point && row.latitude != null && row.longitude != null) {
      const lat = row.locationOverrideLat ?? row.latitude;
      const lng = row.locationOverrideLng ?? row.longitude;
      const R = 6371;
      const dLat = ((lat - point.lat) * Math.PI) / 180;
      const dLng = ((lng - point.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((point.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }
    return toPublicProfile(
      { ...row, badges: badges.get(row.id) ?? [], boosted: boosted.has(row.id) },
      profile.interests ?? [],
      distanceKm
    );
  });
};

const createMatchIfMutual = async (db: any, userId: string, profileId: string, kind: 'spark' | 'super', note?: string) => {
  const [reciprocal] = await db
    .select({ kind: swipes.kind, note: swipes.note })
    .from(swipes)
    .where(and(eq(swipes.fromId, profileId), eq(swipes.toId, userId), inArray(swipes.kind, ['spark', 'super'])))
    .limit(1);
  if (!reciprocal && kind !== 'super') return { matchId: null as string | null, matched: false };
  if (!reciprocal) return { matchId: null as string | null, matched: false };

  const [userOneId, userTwoId] = [userId, profileId].sort();
  const [created] = await db.insert(matches).values({ userOneId, userTwoId }).onConflictDoNothing().returning({ id: matches.id });
  const [existing] = created
    ? [created]
    : await db.select({ id: matches.id }).from(matches).where(and(eq(matches.userOneId, userOneId), eq(matches.userTwoId, userTwoId))).limit(1);
  if (existing && (note || reciprocal.note)) {
    await db.insert(messages).values({
      matchId: existing.id,
      senderId: note ? userId : profileId,
      kind: 'system',
      body: note || reciprocal.note || 'Superlike',
    });
  }
  if (existing) {
    const peerTelegram = await telegramIdForUser(db, profileId);
    const [me] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
    if (peerTelegram) await notifyTelegram(peerTelegram, `У вас новий матч з ${me?.displayName || 'кимось'}! ✨`);
  }
  return { matchId: existing?.id ?? null, matched: Boolean(existing) };
};

export const socialRouter = router({
  orbit: protectedProcedure.query(async ({ ctx }) => {
    const profile = await touchStreakAndPresence(ctx.db, await requireCompleteProfile(ctx.db, ctx.user.id));
    const today = getLocalDate(profile.timeZone);
    if (getLocalHour(profile.timeZone) < 19) {
      return { profiles: [], remaining: 0, date: today, releasePending: true };
    }

    const excluded = [
      ...(await blockedIds(ctx.db, ctx.user.id)),
      ...(await ctx.db.select({ id: swipes.toId }).from(swipes).where(eq(swipes.fromId, ctx.user.id))).map((row: { id: string }) => row.id),
    ];
    let slots = await ctx.db
      .select({ profileId: dailyOrbitProfiles.profileId, position: dailyOrbitProfiles.position })
      .from(dailyOrbitProfiles)
      .where(and(eq(dailyOrbitProfiles.userId, ctx.user.id), eq(dailyOrbitProfiles.orbitDate, today)))
      .orderBy(dailyOrbitProfiles.position);

    if (slots.length === 0) {
      const vip = await hasVip(ctx.db, ctx.user.id);
      const candidates = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(candidateWhere(profile, excluded, vip))
        .orderBy(scoreOrder)
        .limit(8);
      if (candidates.length > 0) {
        await ctx.db
          .insert(dailyOrbitProfiles)
          .values(candidates.map((candidate: { id: string }, position: number) => ({
            userId: ctx.user.id,
            profileId: candidate.id,
            orbitDate: today,
            position,
          })))
          .onConflictDoNothing();
      }
      slots = await ctx.db
        .select({ profileId: dailyOrbitProfiles.profileId, position: dailyOrbitProfiles.position })
        .from(dailyOrbitProfiles)
        .where(and(eq(dailyOrbitProfiles.userId, ctx.user.id), eq(dailyOrbitProfiles.orbitDate, today)))
        .orderBy(dailyOrbitProfiles.position);
    }

    const remainingSlots = slots.filter((slot: { profileId: string }) => !excluded.includes(slot.profileId));
    const candidateIds = remainingSlots.map((slot: { profileId: string }) => slot.profileId);
    const rows = candidateIds.length
      ? await ctx.db
          .select({
            ...publicProfileFields,
            latitude: users.latitude,
            longitude: users.longitude,
            locationOverrideLat: users.locationOverrideLat,
            locationOverrideLng: users.locationOverrideLng,
            createdAt: users.createdAt,
            xp: users.xp,
          })
          .from(users)
          .where(and(inArray(users.id, candidateIds), isNotNull(users.onboardingCompletedAt), isNull(users.bannedAt), isNull(users.shadowbannedAt)))
      : [];
    const byId = new Map(rows.map((row: any) => [row.id, row]));
    const orderedRows = remainingSlots.map((slot: { profileId: string }) => byId.get(slot.profileId)).filter(Boolean);
    return {
      profiles: await attachMeta(ctx.db, profile, orderedRows),
      remaining: orderedRows.length,
      date: today,
      releasePending: false,
    };
  }),

  incomingSparks: protectedProcedure.query(async ({ ctx }) => {
    const incoming = await ctx.db
      .select({ userId: swipes.fromId })
      .from(swipes)
      .where(and(eq(swipes.toId, ctx.user.id), inArray(swipes.kind, ['spark', 'super'])));
    const alreadyReacted = new Set(
      (await ctx.db.select({ profileId: swipes.toId }).from(swipes).where(eq(swipes.fromId, ctx.user.id)))
        .map((row: { profileId: string }) => row.profileId)
    );
    return { count: incoming.filter((row: { userId: string }) => !alreadyReacted.has(row.userId)).length };
  }),
  deck: protectedProcedure
    .input(z.object({ mode: z.enum(['cards', 'grid']).default('cards') }).optional())
    .query(async ({ ctx, input }) => {
      const profile = await touchStreakAndPresence(ctx.db, await requireCompleteProfile(ctx.db, ctx.user.id));
      const vip = await hasVip(ctx.db, ctx.user.id);
      const excluded = [
        ...(await blockedIds(ctx.db, ctx.user.id)),
        ...(await ctx.db.select({ id: swipes.toId }).from(swipes).where(eq(swipes.fromId, ctx.user.id))).map((row: { id: string }) => row.id),
      ];
      const limit = input?.mode === 'grid' ? 24 : 12;
      const rows = await ctx.db
        .select({
          ...publicProfileFields,
          latitude: users.latitude,
          longitude: users.longitude,
          locationOverrideLat: users.locationOverrideLat,
          locationOverrideLng: users.locationOverrideLng,
          createdAt: users.createdAt,
          xp: users.xp,
        })
        .from(users)
        .where(candidateWhere(profile, excluded, vip))
        .orderBy(scoreOrder)
        .limit(limit);
      const likesLeft = remainingLikes(profile, vip);
      return {
        profiles: await attachMeta(ctx.db, profile, rows),
        remainingLikes: Number.isFinite(likesLeft) ? likesLeft : null,
        dailyLimit: vip ? null : FREE_DAILY_LIKES,
        vip,
        superlikeBalance: profile.superlikeBalance ?? 0,
        streak: profile.streakCount ?? 0,
        canRewind: vip && Boolean(profile.lastPassProfileId),
      };
    }),

  swipe: protectedProcedure
    .input(
      z.object({
        profileId: z.string().uuid(),
        kind: z.enum(['spark', 'pass', 'super']),
        note: z.string().trim().max(180).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await touchStreakAndPresence(ctx.db, await requireCompleteProfile(ctx.db, ctx.user.id));
      if (input.profileId === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot react to your own profile.' });
      const vip = await hasVip(ctx.db, ctx.user.id);
      const likesLeft = remainingLikes(profile, vip);
      if (input.kind !== 'pass' && likesLeft <= 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Daily like limit reached. Unlock VIP for unlimited swipes.' });
      }
      if (input.kind === 'super') {
        if ((profile.superlikeBalance ?? 0) < 1) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Buy a Superlike with Stars first.' });
        }
      }

      const [saved] = await ctx.db
        .insert(swipes)
        .values({ fromId: ctx.user.id, toId: input.profileId, kind: input.kind, note: input.note })
        .onConflictDoNothing()
        .returning({ kind: swipes.kind });

      const today = getLocalDate(profile.timeZone);
      const used = profile.dailyLikesOn === today ? profile.dailyLikesUsed ?? 0 : 0;
      const patch: Record<string, unknown> = {};
      if (saved && input.kind !== 'pass') {
        patch.dailyLikesUsed = used + 1;
        patch.dailyLikesOn = today;
        patch.lastPassProfileId = null;
        await grantXp(ctx.db, ctx.user.id, 2);
        await bumpQuest(ctx.db, ctx.user.id, profile.timeZone, 'swipe-20');
      }
      if (saved && input.kind === 'pass') patch.lastPassProfileId = input.profileId;
      if (saved && input.kind === 'super') {
        patch.superlikeBalance = sql`${users.superlikeBalance} - 1`;
        await bumpQuest(ctx.db, ctx.user.id, profile.timeZone, 'superlike-1');
      }
      if (Object.keys(patch).length) await ctx.db.update(users).set(patch).where(eq(users.id, ctx.user.id));

      const [likes] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(swipes)
        .where(and(eq(swipes.toId, input.profileId), inArray(swipes.kind, ['spark', 'super'])));
      if ((likes?.count ?? 0) >= 50) await awardAchievement(ctx.db, input.profileId, 'magnet-50');
      if ((likes?.count ?? 0) >= 100) await awardAchievement(ctx.db, input.profileId, 'magnet-100');
      if ((likes?.count ?? 0) >= 500) await awardAchievement(ctx.db, input.profileId, 'magnet-500');

      let match = { matchId: null as string | null, matched: false };
      if (input.kind !== 'pass') match = await createMatchIfMutual(ctx.db, ctx.user.id, input.profileId, input.kind, input.note);
      return { kind: saved?.kind ?? input.kind, ...match };
    }),

  rewind: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await requireCompleteProfile(ctx.db, ctx.user.id);
    if (!(await hasVip(ctx.db, ctx.user.id)) || !profile.lastPassProfileId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Rewind is a VIP feature.' });
    }
    await ctx.db.delete(swipes).where(and(eq(swipes.fromId, ctx.user.id), eq(swipes.toId, profile.lastPassProfileId)));
    await ctx.db.update(users).set({ lastPassProfileId: null }).where(eq(users.id, ctx.user.id));
    return { profileId: profile.lastPassProfileId };
  }),

  incomingLikes: protectedProcedure.query(async ({ ctx }) => {
    const vip = await hasVip(ctx.db, ctx.user.id);
    const profile = await requireCompleteProfile(ctx.db, ctx.user.id);
    const rows = await ctx.db
      .select({
        ...publicProfileFields,
        kind: swipes.kind,
        note: swipes.note,
        createdAt: swipes.createdAt,
        latitude: users.latitude,
        longitude: users.longitude,
        locationOverrideLat: users.locationOverrideLat,
        locationOverrideLng: users.locationOverrideLng,
      })
      .from(swipes)
      .innerJoin(users, eq(users.id, swipes.fromId))
      .where(and(eq(swipes.toId, ctx.user.id), inArray(swipes.kind, ['spark', 'super'])))
      .orderBy(desc(swipes.createdAt))
      .limit(50);
    const already = new Set(
      (await ctx.db.select({ id: swipes.toId }).from(swipes).where(eq(swipes.fromId, ctx.user.id))).map((row: { id: string }) => row.id)
    );
    const pending = rows.filter((row: any) => !already.has(row.id));
    const profiles = await attachMeta(ctx.db, profile, pending);
    return {
      count: pending.length,
      vip,
      profiles: vip
        ? profiles
        : profiles.map((item: any) => ({
            ...item,
            displayName: '???',
            photos: [],
            bio: null,
            city: item.city,
          })),
    };
  }),

  setIncognito: protectedProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (!(await hasVip(ctx.db, ctx.user.id))) throw new TRPCError({ code: 'FORBIDDEN', message: 'Incognito is a VIP feature.' });
    await ctx.db
      .update(users)
      .set({ incognitoUntil: input.enabled ? new Date(Date.now() + 24 * 3600_000) : null })
      .where(eq(users.id, ctx.user.id));
    return { ok: true };
  }),

  setPassport: protectedProcedure
    .input(
      z.object({
        city: z.string().trim().min(2).max(80),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await hasVip(ctx.db, ctx.user.id))) throw new TRPCError({ code: 'FORBIDDEN', message: 'Passport is a VIP feature.' });
      await ctx.db
        .update(users)
        .set({
          locationOverrideCity: input.city,
          locationOverrideLat: input.latitude,
          locationOverrideLng: input.longitude,
          geo: sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography`,
        })
        .where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),

  blockProfile: protectedProcedure.input(z.object({ profileId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    if (input.profileId === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid profile.' });
    await ctx.db.insert(blockedUsers).values({ userId: ctx.user.id, blockedUserId: input.profileId }).onConflictDoNothing();
    return { ok: true };
  }),

  reportProfile: protectedProcedure
    .input(
      z.object({
        profileId: z.string().uuid(),
        matchId: z.string().uuid().optional(),
        reason: z.enum(['spam', 'harassment', 'fake_profile', 'underage', 'other']),
        details: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(reports).values({
        reporterId: ctx.user.id,
        reportedUserId: input.profileId,
        matchId: input.matchId,
        reason: input.reason,
        details: input.details,
      });
      return { ok: true };
    }),

  matches: protectedProcedure.query(async ({ ctx }) => {
    const excluded = new Set(await blockedIds(ctx.db, ctx.user.id));
    const userMatches = await ctx.db
      .select()
      .from(matches)
      .where(or(eq(matches.userOneId, ctx.user.id), eq(matches.userTwoId, ctx.user.id)))
      .orderBy(desc(matches.createdAt))
      .limit(100);
    const visible = userMatches.filter((match: any) => !excluded.has(match.userOneId === ctx.user.id ? match.userTwoId : match.userOneId));
    if (!visible.length) return [];
    const peerIds = visible.map((match: any) => (match.userOneId === ctx.user.id ? match.userTwoId : match.userOneId));
    const [peerProfiles, recentMessages, unread] = await Promise.all([
      ctx.db.select(publicProfileFields).from(users).where(inArray(users.id, peerIds)),
      ctx.db
        .select()
        .from(messages)
        .where(inArray(messages.matchId, visible.map((match: any) => match.id)))
        .orderBy(desc(messages.createdAt))
        .limit(500),
      ctx.db
        .select({ matchId: messages.matchId, count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            inArray(messages.matchId, visible.map((match: any) => match.id)),
            ne(messages.senderId, ctx.user.id),
            isNull(messages.readAt)
          )
        )
        .groupBy(messages.matchId),
    ]);
    const profilesById = new Map<string, any>(peerProfiles.map((row: any) => [row.id, row] as [string, any]));
    const lastByMatch = new Map<string, any>();
    for (const message of recentMessages) {
      if (!lastByMatch.has(message.matchId)) lastByMatch.set(message.matchId, message);
    }
    const unreadByMatch = new Map<string, number>(unread.map((row: any) => [row.matchId, row.count] as [string, number]));
    return visible.map((match: any) => {
      const peerId = match.userOneId === ctx.user.id ? match.userTwoId : match.userOneId;
      const lastMessage = lastByMatch.get(match.id);
      return {
        id: match.id,
        createdAt: match.createdAt,
        unread: unreadByMatch.get(match.id) ?? 0,
        profile: profilesById.get(peerId) ? toPublicProfile(profilesById.get(peerId), []) : null,
        lastMessage: lastMessage
          ? { body: lastMessage.body, sentByMe: lastMessage.senderId === ctx.user.id, createdAt: lastMessage.createdAt, kind: lastMessage.kind }
          : null,
      };
    });
  }),

  chatMessages: protectedProcedure.input(z.object({ matchId: z.string().uuid(), afterId: z.number().int().optional() })).query(async ({ ctx, input }) => {
    await getMatchForUser(ctx.db, input.matchId, ctx.user.id);
    const history = await ctx.db
      .select()
      .from(messages)
      .where(
        input.afterId
          ? and(eq(messages.matchId, input.matchId), sql`${messages.id} > ${input.afterId}`)
          : eq(messages.matchId, input.matchId)
      )
      .orderBy(desc(messages.createdAt))
      .limit(100);
    await ctx.db
      .update(messages)
      .set({ readAt: new Date(), deliveredAt: sql`COALESCE(${messages.deliveredAt}, NOW())` })
      .where(and(eq(messages.matchId, input.matchId), ne(messages.senderId, ctx.user.id), isNull(messages.readAt)));
    const shares = await ctx.db.select().from(contactShares).where(eq(contactShares.matchId, input.matchId));
    return {
      messages: history.reverse(),
      contact: {
        offeredByMe: shares.some((row: any) => row.userId === ctx.user.id),
        mutual: shares.length >= 2,
        usernames: shares.length >= 2 ? shares.map((row: any) => row.telegramUsername) : [],
      },
    };
  }),

  sendMessage: protectedProcedure
    .input(z.object({ matchId: z.string().uuid(), body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) }))
    .mutation(async ({ ctx, input }) => {
      const match = await getMatchForUser(ctx.db, input.matchId, ctx.user.id);
      const [recentCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(eq(messages.senderId, ctx.user.id), gte(messages.createdAt, new Date(Date.now() - 60_000))));
      if ((recentCount?.count ?? 0) >= 12) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Please slow down before sending more messages.' });
      }
      const [message] = await ctx.db
        .insert(messages)
        .values({ matchId: input.matchId, senderId: ctx.user.id, body: input.body, deliveredAt: new Date() })
        .returning();
      await awardAchievement(ctx.db, ctx.user.id, 'first-hello');
      const counts = await ctx.db
        .select({ matchId: messages.matchId, count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.senderId, ctx.user.id))
        .groupBy(messages.matchId);
      const longChats = counts.filter((row: any) => row.count >= 10).length;
      if (longChats >= 10) await awardAchievement(ctx.db, ctx.user.id, 'dialog-master');
      const senderCounts = await ctx.db
        .select({ senderId: messages.senderId, count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.matchId, input.matchId))
        .groupBy(messages.senderId);
      const myCount = senderCounts.find((entry: any) => entry.senderId === ctx.user.id)?.count ?? 0;
      const peerCount = senderCounts.find((entry: any) => entry.senderId !== ctx.user.id)?.count ?? 0;
      if (myCount >= 5 && peerCount >= 5) {
        const peerId = match.userOneId === ctx.user.id ? match.userTwoId : match.userOneId;
        await Promise.all([awardAchievement(ctx.db, ctx.user.id, 'good-conversation'), awardAchievement(ctx.db, peerId, 'good-conversation')]);
      }
      return message;
    }),

  shareContact: protectedProcedure.input(z.object({ matchId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await getMatchForUser(ctx.db, input.matchId, ctx.user.id);
    const [me] = await ctx.db.select({ telegramUsername: users.telegramUsername }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!me?.telegramUsername) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Open Constella from Telegram so we can share your username.' });
    }
    await ctx.db
      .insert(contactShares)
      .values({ matchId: input.matchId, userId: ctx.user.id, telegramUsername: me.telegramUsername })
      .onConflictDoNothing();
    const shares = await ctx.db.select().from(contactShares).where(eq(contactShares.matchId, input.matchId));
    if (shares.length >= 2) {
      await ctx.db.insert(messages).values({
        matchId: input.matchId,
        senderId: ctx.user.id,
        kind: 'contact',
        body: shares.map((row: any) => `@${row.telegramUsername}`).join(' · '),
      });
    }
    return { mutual: shares.length >= 2 };
  }),

  sendGift: protectedProcedure
    .input(z.object({ profileId: z.string().uuid(), sku: z.enum(['gift_rose', 'gift_star', 'gift_constellation']) }))
    .mutation(async ({ ctx, input }) => {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Create a Stars invoice for ${STAR_PRODUCTS[input.sku].title} first.`,
      });
    }),

  receivedGifts: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(gifts).where(eq(gifts.toId, ctx.user.id)).orderBy(desc(gifts.createdAt)).limit(50);
  }),

  quests: protectedProcedure.query(async ({ ctx }) => {
    const profile = await touchStreakAndPresence(ctx.db, await requireCompleteProfile(ctx.db, ctx.user.id));
    const today = getLocalDate(profile.timeZone);
    const [earned, progress] = await Promise.all([
      ctx.db.select().from(userAchievements).where(eq(userAchievements.userId, ctx.user.id)),
      ctx.db
        .select()
        .from(questProgress)
        .where(and(eq(questProgress.userId, ctx.user.id), eq(questProgress.periodKey, today))),
    ]);
    const earnedByCode = new Map<string, any>(earned.map((row: any) => [row.code, row.earnedAt] as [string, any]));
    const progressByCode = new Map<string, any>(progress.map((row: any) => [row.code, row] as [string, any]));
    return {
      xp: profile.xp ?? 0,
      level: profile.level ?? 1,
      streak: profile.streakCount ?? 0,
      freezes: profile.streakFreezes ?? 0,
      referralCode: profile.referralCode,
      daily: DAILY_QUESTS.map((quest) => {
        const row = progressByCode.get(quest.code);
        return { ...quest, progress: row?.progress ?? 0, completedAt: row?.completedAt ?? null };
      }),
      achievements: ACHIEVEMENTS.map((achievement) => ({ ...achievement, earnedAt: earnedByCode.get(achievement.code) ?? null })),
    };
  }),

  completeInviteQuest: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await requireCompleteProfile(ctx.db, ctx.user.id);
    await bumpQuest(ctx.db, ctx.user.id, profile.timeZone, 'invite-friend');
    return { ok: true };
  }),
});
