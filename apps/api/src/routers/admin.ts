import { TRPCError } from '@trpc/server';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq, gte, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  adminAuditLogs,
  gifts,
  matches,
  messages,
  paymentIntents,
  photoAssets,
  pushDevices,
  reports,
  supportTickets,
  telegramStarPayments,
  userBoosts,
  userEntitlements,
  users,
  webCredentials,
} from '@constella/db';
import { z } from 'zod';
import { isVipPlan } from '@constella/shared';
import { adminProcedure, protectedProcedure, router } from '../trpc.js';
import { invalidateAdminSession } from '../blog/guard.js';
import { removePhotoObjects } from '../photos/storage.js';
import { EXPO_TOKEN_RE, isQuietFor, notifyBroadcast } from '../push/notify.js';
import {
  cancelEntitlementSchema,
  createAdminSchema,
  forceLogoutSchema,
  grantVipSchema,
  metricsSchema,
  profilePatchSchema,
  pushAudienceSchema,
  pushBroadcastSchema,
  revokeAdminSchema,
  setEntitlementSchema,
  userContentSchema,
} from './admin.schemas.js';

const pageInput = z.object({ limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0) });
const ageSql = sql<number>`EXTRACT(YEAR FROM AGE(CURRENT_DATE, ${users.birthdate}))::int`;

// Один Vercel-виклик тримає ~1000 тікетів (чанки по 100, чотири паралельні запити, 8-секундний
// таймаут на чанк). Перевищити межу — це обрізати аудиторію, а не чекати, доки функцію зніме
// платформа посеред розсилки.
const MAX_BROADCAST_TOKENS = 1000;

const utcDay = (column: any) => sql<string>`to_char(date_trunc('day', ${column} at time zone 'utc'), 'YYYY-MM-DD')`;

// drizzle інтерполює колонку без імені таблиці, тому в корельованому підзапиті `${users.id}`
// розв'язався б у колонку внутрішньої таблиці (в `messages` теж є `id`) або став би ambiguous.
// Зовнішній `users.id` у підзапитах пишемо з іменем таблиці явно.
const outerUserId = sql`"users"."id"`;

/**
 * Адресати розсилки: пристрій має бути живий, акаунт — не забанений, і VIP рахується за
 * чинною підпискою, а не рядком в історії.
 */
const audienceFilter = (audience: string, days: number) => {
  const window = sql`now() - make_interval(days => ${days}::int)`;
  const reachable = and(isNull(users.bannedAt), isNull(users.shadowbannedAt));
  if (audience === 'active') return and(reachable, gte(users.lastActiveAt, window));
  if (audience === 'new') return and(reachable, gte(users.createdAt, window));
  if (audience === 'vip') {
    return and(reachable, sql`exists (
      select 1 from ${userEntitlements}
      where ${userEntitlements.userId} = ${outerUserId}
        and ${userEntitlements.status} = 'active'
        and ${userEntitlements.expiresAt} > now()
    )`);
  }
  return reachable;
};

const recipientRows = async (db: any, input: { audience: string; days: number }, limit: number) => {
  const rows = await db.select({
    userId: pushDevices.userId,
    pushToken: pushDevices.pushToken,
    timeZone: users.timeZone,
  }).from(pushDevices)
    .innerJoin(users, eq(users.id, pushDevices.userId))
    .where(audienceFilter(input.audience, input.days))
    .limit(limit);
  return rows as { userId: string; pushToken: string; timeZone: string | null }[];
};

/**
 * Тиху годину рахуємо в JS, а не в SQL: `users.time_zone` приходить із клієнта, і один
 * рядок на кшталт `Kyiv+3` звалив би весь запит помилкою Postgres про невідомий часовий пояс.
 */
const summariseRecipients = (rows: { userId: string; pushToken: string; timeZone: string | null }[]) => {
  const sendable = rows.filter((row) => EXPO_TOKEN_RE.test(row.pushToken));
  return {
    devices: rows.length,
    people: new Set(rows.map((row) => row.userId)).size,
    sendable: sendable.length,
    quiet: sendable.filter((row) => isQuietFor(row.timeZone)).length,
    malformed: rows.length - sendable.length,
  };
};

export const adminRouter = router({
  access: protectedProcedure.query(({ ctx }) => ({ isAdmin: ctx.isAdmin })),

  admins: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select({
      id: users.id,
      email: webCredentials.email,
      createdAt: users.createdAt,
      lastLoginAt: webCredentials.lastLoginAt,
    }).from(users)
      .leftJoin(webCredentials, eq(webCredentials.userId, users.id))
      .where(eq(users.role, 'admin'))
      .orderBy(desc(users.createdAt));

    const rootEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
    const envIds = new Set((process.env.ADMIN_USER_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
    return {
      rows: rows.map((row: { id: string; email: string | null; createdAt: Date; lastLoginAt: Date | null }) => ({
        ...row,
        isRoot: Boolean(rootEmail) && row.email === rootEmail,
        isEnvListed: envIds.has(row.id),
      })),
    };
  }),

  // Пароль показується рівно один раз у відповіді: у БД лежить лише bcrypt-хеш, тож
  // відновити його неможливо — root відкликає адміна й створює нового.
  createAdmin: adminProcedure.input(createAdminSchema).mutation(async ({ ctx, input }) => {
    const rootEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (rootEmail && input.email === rootEmail) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Ця пошта закріплена за root-адміністратором з .env.' });
    }

    const [existing] = await ctx.db.select({ userId: webCredentials.userId }).from(webCredentials)
      .where(eq(webCredentials.email, input.email)).limit(1);
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Акаунт із цією поштою вже існує — наявні акаунти не підвищуються до адмінів.',
      });
    }

    const password = randomBytes(18).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 12);

    let created: { id: string };
    try {
      created = await ctx.db.transaction(async (tx: any) => {
        const [user] = await tx.insert(users)
          .values({ birthdate: new Date('2000-01-01'), gender: 'none', lookingFor: [], role: 'admin' })
          .returning({ id: users.id });
        await tx.insert(webCredentials).values({
          userId: user.id,
          email: input.email,
          passwordHash,
          emailVerifiedAt: new Date(),
        });
        await tx.insert(adminAuditLogs).values({
          actorUserId: ctx.user.id,
          targetUserId: user.id,
          action: 'admin.create',
          reason: input.reason,
          metadata: { email: input.email },
        });
        return user;
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new TRPCError({ code: 'CONFLICT', message: 'Акаунт із цією поштою вже існує.' });
      }
      throw error;
    }

    return { id: created.id, email: input.email, password };
  }),

  // role alone would leave a live JWT valid for the rest of its 8 hours, so the bump is
  // what actually ends the session; the cache is dropped because it may still say "allowed".
  revokeAdmin: adminProcedure.input(revokeAdminSchema).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Не можна відкликати власний доступ.' });
    }

    const rootEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const envIds = new Set((process.env.ADMIN_USER_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean));

    const [target] = await ctx.db.select({
      id: users.id,
      role: users.role,
      email: webCredentials.email,
    }).from(users)
      .leftJoin(webCredentials, eq(webCredentials.userId, users.id))
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!target || target.role !== 'admin') {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Адміністратора не знайдено.' });
    }
    if (rootEmail && target.email === rootEmail) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Root-адміністратор задається в .env — відкликати його з консолі не можна.' });
    }
    if (envIds.has(target.id)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Доступ надано через ADMIN_USER_IDS — прибери id зі змінної середовища.' });
    }

    const updated = await ctx.db.transaction(async (tx: any) => {
      const [row] = await tx.update(users)
        .set({ role: 'user', sessionVersion: sql`${users.sessionVersion} + 1` })
        .where(and(eq(users.id, input.userId), eq(users.role, 'admin')))
        .returning({ sessionVersion: users.sessionVersion });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Адміністратора не знайдено.' });
      await tx.insert(adminAuditLogs).values({
        actorUserId: ctx.user.id,
        targetUserId: input.userId,
        action: 'admin.revoke',
        reason: input.reason,
        metadata: { email: target.email, sessionVersion: row.sessionVersion },
      });
      return row;
    });

    invalidateAdminSession(input.userId);
    return { ok: true, sessionVersion: updated.sessionVersion };
  }),

  overview: adminProcedure.query(async ({ ctx }) => {
    const [counts] = await ctx.db.select({
      totalUsers: sql<number>`count(*)::int`,
      onboardedUsers: sql<number>`count(*) FILTER (WHERE ${users.onboardingCompletedAt} IS NOT NULL)::int`,
      bannedUsers: sql<number>`count(*) FILTER (WHERE ${users.bannedAt} IS NOT NULL)::int`,
      shadowbannedUsers: sql<number>`count(*) FILTER (WHERE ${users.shadowbannedAt} IS NOT NULL)::int`,
      activeToday: sql<number>`count(*) FILTER (WHERE ${users.lastActiveAt} >= NOW() - INTERVAL '24 hours')::int`,
    }).from(users);
    const [reportCounts] = await ctx.db.select({
      openReports: sql<number>`count(*) FILTER (WHERE ${reports.status} IN ('open','reviewing'))::int`,
      totalReports: sql<number>`count(*)::int`,
    }).from(reports);
    const [revenue] = await ctx.db.select({
      stars30d: sql<number>`COALESCE(sum(${telegramStarPayments.totalAmount}),0)::int`,
      payments30d: sql<number>`count(*)::int`,
    }).from(telegramStarPayments).where(sql`${telegramStarPayments.paidAt} >= NOW() - INTERVAL '30 days'`);
    return { ...counts, ...reportCounts, ...revenue };
  }),

  users: adminProcedure.input(pageInput.extend({
    query: z.string().trim().max(100).optional(),
    status: z.enum(['all', 'active', 'banned', 'shadowbanned']).default('all'),
  })).query(async ({ ctx, input }) => {
    const filter = and(
      input.status === 'banned' ? sql`${users.bannedAt} IS NOT NULL` : undefined,
      input.status === 'shadowbanned' ? sql`${users.shadowbannedAt} IS NOT NULL` : undefined,
      input.status === 'active' ? and(isNull(users.bannedAt), isNull(users.shadowbannedAt)) : undefined,
      input.query ? or(ilike(users.displayName, `%${input.query}%`), ilike(users.city, `%${input.query}%`), sql`${users.id}::text ILIKE ${`%${input.query}%`}`) : undefined
    );
    const [total] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(users).where(filter);
    const rows = await ctx.db.select({
      id: users.id, displayName: users.displayName, city: users.city, age: ageSql,
      createdAt: users.createdAt, lastActiveAt: users.lastActiveAt,
      onboardingCompletedAt: users.onboardingCompletedAt, verifiedAt: users.verifiedAt,
      bannedAt: users.bannedAt, shadowbannedAt: users.shadowbannedAt,
      vip: sql<boolean>`${userEntitlements.expiresAt} > NOW() AND ${userEntitlements.status} <> 'expired' AND ${userEntitlements.plan} IN ('vip', 'plus', 'prime')`,
      vipExpiresAt: userEntitlements.expiresAt,
    }).from(users).leftJoin(userEntitlements, eq(userEntitlements.userId, users.id))
      .where(filter).orderBy(desc(users.createdAt)).limit(input.limit).offset(input.offset);
    return { total: total.count, rows };
  }),

  reports: adminProcedure.input(pageInput.extend({ status: z.enum(['all', 'open', 'reviewing', 'resolved', 'dismissed']).default('open') }))
    .query(async ({ ctx, input }) => {
      const statusFilter = input.status === 'all' ? undefined : eq(reports.status, input.status);
      const [total] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(reports)
        .innerJoin(users, eq(users.id, reports.reporterId)).where(statusFilter);
      const rows = await ctx.db.select({
        id: reports.id, reason: reports.reason, details: reports.details, status: reports.status,
        createdAt: reports.createdAt, moderatorNote: reports.moderatorNote,
        reporterId: users.id, reportedUserId: reports.reportedUserId,
        reporterName: users.displayName,
      }).from(reports).innerJoin(users, eq(users.id, reports.reporterId))
        .where(statusFilter).orderBy(desc(reports.createdAt)).limit(input.limit).offset(input.offset);
      return { total: total.count, rows };
    }),

  reviewReport: adminProcedure.input(z.object({
    reportId: z.number().int().positive(),
    status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']),
    note: z.string().trim().max(1000).default(''),
  })).mutation(async ({ ctx, input }) => {
    await ctx.db.transaction(async (tx: any) => {
      const [updated] = await tx.update(reports).set({
        status: input.status, moderatorNote: input.note || null, reviewedAt: new Date(), reviewedByUserId: ctx.user.id,
      }).where(eq(reports.id, input.reportId)).returning({ id: reports.id });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report not found.' });
      await tx.insert(adminAuditLogs).values({
        actorUserId: ctx.user.id, reportId: input.reportId, action: 'report.review',
        reason: input.note || null, metadata: { status: input.status },
      });
    });
    return { ok: true };
  }),

  setUserStatus: adminProcedure.input(z.object({
    userId: z.string().uuid(),
    status: z.enum(['active', 'banned', 'shadowbanned']),
    reason: z.string().trim().min(8).max(500),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.id === input.userId && input.status !== 'active') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot restrict your own account.' });
    }
    const at = new Date();
    await ctx.db.transaction(async (tx: any) => {
      const [target] = await tx.update(users).set({
        bannedAt: input.status === 'banned' ? at : null,
        shadowbannedAt: input.status === 'shadowbanned' ? at : null,
      }).where(eq(users.id, input.userId)).returning({ id: users.id });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
      await tx.insert(adminAuditLogs).values({
        actorUserId: ctx.user.id, targetUserId: input.userId, action: 'user.status',
        reason: input.reason, metadata: { status: input.status },
      });
    });
    return { ok: true };
  }),

  grantVip: adminProcedure.input(grantVipSchema).mutation(async ({ ctx, input }) => {
    if (ctx.user.id === input.userId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot grant VIP to your own account.' });
    }

    const now = new Date();
    const expiresAt = await ctx.db.transaction(async (tx: any) => {
      const [target] = await tx.select({ id: users.id }).from(users)
        .where(eq(users.id, input.userId)).for('update').limit(1);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

      const [current] = await tx.select().from(userEntitlements)
        .where(eq(userEntitlements.userId, input.userId)).limit(1);
      const startsAt = current?.startsAt ?? now;
      const grantStartsAt = current?.expiresAt && current.expiresAt > now ? current.expiresAt : now;
      const grantExpiresAt = new Date(grantStartsAt.getTime() + input.days * 24 * 60 * 60 * 1000);

      await tx.insert(userEntitlements).values({
        userId: input.userId,
        plan: 'vip',
        source: 'admin',
        status: 'active',
        startsAt,
        expiresAt: grantExpiresAt,
        telegramSubscriptionChargeId: current?.telegramSubscriptionChargeId ?? null,
        cancelledAt: null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: userEntitlements.userId,
        set: {
          plan: 'vip',
          source: 'admin',
          status: 'active',
          expiresAt: grantExpiresAt,
          cancelledAt: null,
          updatedAt: now,
        },
      });

      await tx.insert(adminAuditLogs).values({
        actorUserId: ctx.user.id,
        targetUserId: input.userId,
        action: 'user.vip.grant',
        reason: input.reason,
        metadata: { days: input.days, expiresAt: grantExpiresAt.toISOString(), previousExpiresAt: current?.expiresAt?.toISOString() ?? null },
      });
      return grantExpiresAt;
    });

    return { ok: true, expiresAt };
  }),


  photoQueue: adminProcedure.input(pageInput.extend({ status: z.enum(['pending','approved','rejected']).default('pending') }))
    .query(async ({ ctx, input }) => {
      const [total] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(photoAssets)
        .innerJoin(users, eq(users.id, photoAssets.userId)).where(eq(photoAssets.moderationStatus, input.status));
      const rows = await ctx.db.select({
        id: photoAssets.id, userId: photoAssets.userId, displayName: users.displayName,
        publicUrl: photoAssets.publicUrl, width: photoAssets.width, height: photoAssets.height,
        moderationScore: photoAssets.moderationScore, moderationProvider: photoAssets.moderationProvider,
        moderationStatus: photoAssets.moderationStatus, moderationNote: photoAssets.moderationNote,
        moderatedByUserId: photoAssets.moderatedByUserId, moderatedAt: photoAssets.moderatedAt,
        createdAt: photoAssets.createdAt,
      }).from(photoAssets).innerJoin(users, eq(users.id, photoAssets.userId))
        .where(eq(photoAssets.moderationStatus, input.status)).orderBy(desc(photoAssets.createdAt))
        .limit(input.limit).offset(input.offset);
      return { total: total.count, rows };
    }),

  reviewPhoto: adminProcedure.input(z.object({
    photoId: z.string().uuid(), status: z.enum(['approved','rejected']), reason: z.string().trim().min(4).max(500),
  })).mutation(async ({ ctx, input }) => {
    const [asset] = await ctx.db.select().from(photoAssets).where(eq(photoAssets.id, input.photoId)).limit(1);
    if (!asset) throw new TRPCError({ code: 'NOT_FOUND', message: 'Photo not found.' });
    await ctx.db.transaction(async (tx: any) => {
      await tx.update(photoAssets).set({
        moderationStatus: input.status, moderationNote: input.reason, moderatedByUserId: ctx.user.id, moderatedAt: new Date(),
      }).where(eq(photoAssets.id, asset.id));
      const [user] = await tx.select({ photos: users.photos }).from(users).where(eq(users.id, asset.userId)).limit(1);
      const current = user?.photos ?? [];
      const photos = input.status === 'approved'
        ? current.includes(asset.publicUrl) ? current : [...current, asset.publicUrl]
        : current.filter((url: string) => url !== asset.publicUrl);
      await tx.update(users).set({ photos }).where(eq(users.id, asset.userId));
      await tx.insert(adminAuditLogs).values({
        actorUserId: ctx.user.id, targetUserId: asset.userId, action: 'photo.review',
        reason: input.reason, metadata: { photoId: asset.id, status: input.status },
      });
    });
    if (input.status === 'rejected') await removePhotoObjects([asset.imageKey]);
    return { ok: true };
  }),

  payments: adminProcedure.input(pageInput).query(async ({ ctx, input }) => {
    const [total] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(telegramStarPayments)
      .innerJoin(paymentIntents, eq(paymentIntents.id, telegramStarPayments.paymentIntentId))
      .innerJoin(users, eq(users.id, telegramStarPayments.userId));
    const rows = await ctx.db.select({
      id: telegramStarPayments.id, paidAt: telegramStarPayments.paidAt,
      stars: telegramStarPayments.totalAmount, currency: telegramStarPayments.currency,
      recurring: telegramStarPayments.isRecurring, sku: paymentIntents.sku,
      plan: paymentIntents.plan, userId: telegramStarPayments.userId,
      displayName: users.displayName,
    }).from(telegramStarPayments)
      .innerJoin(paymentIntents, eq(paymentIntents.id, telegramStarPayments.paymentIntentId))
      .innerJoin(users, eq(users.id, telegramStarPayments.userId))
      .orderBy(desc(telegramStarPayments.paidAt)).limit(input.limit).offset(input.offset);
    return { total: total.count, rows };
  }),

  audit: adminProcedure.input(pageInput).query(async ({ ctx, input }) => {
    const [total] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(adminAuditLogs)
      .innerJoin(users, eq(users.id, adminAuditLogs.actorUserId));
    const rows = await ctx.db.select({
      id: adminAuditLogs.id, action: adminAuditLogs.action, reason: adminAuditLogs.reason,
      metadata: adminAuditLogs.metadata, createdAt: adminAuditLogs.createdAt,
      actorId: adminAuditLogs.actorUserId, actorName: users.displayName,
      targetUserId: adminAuditLogs.targetUserId, reportId: adminAuditLogs.reportId,
    }).from(adminAuditLogs).innerJoin(users, eq(users.id, adminAuditLogs.actorUserId))
      .orderBy(desc(adminAuditLogs.createdAt)).limit(input.limit).offset(input.offset);
    return { total: total.count, rows };
  }),

  subscription: adminProcedure.input(z.object({ userId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [profile] = await ctx.db.select({
      id: users.id, displayName: users.displayName, createdAt: users.createdAt,
      bannedAt: users.bannedAt, sessionVersion: users.sessionVersion,
    }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

    const [entitlement] = await ctx.db.select().from(userEntitlements)
      .where(eq(userEntitlements.userId, input.userId)).limit(1);
    const intents = await ctx.db.select({
      id: paymentIntents.id, sku: paymentIntents.sku, plan: paymentIntents.plan, status: paymentIntents.status,
      currency: paymentIntents.currency, totalAmount: paymentIntents.totalAmount,
      createdAt: paymentIntents.createdAt, expiresAt: paymentIntents.expiresAt,
    }).from(paymentIntents).where(eq(paymentIntents.userId, input.userId))
      .orderBy(desc(paymentIntents.createdAt)).limit(20);
    const charges = await ctx.db.select({
      id: telegramStarPayments.id, intentId: telegramStarPayments.paymentIntentId,
      chargeId: telegramStarPayments.telegramPaymentChargeId, currency: telegramStarPayments.currency,
      stars: telegramStarPayments.totalAmount, recurring: telegramStarPayments.isRecurring,
      firstRecurring: telegramStarPayments.isFirstRecurring, paidAt: telegramStarPayments.paidAt,
    }).from(telegramStarPayments).where(eq(telegramStarPayments.userId, input.userId))
      .orderBy(desc(telegramStarPayments.paidAt)).limit(20);
    const boosts = await ctx.db.select({
      id: userBoosts.id, startsAt: userBoosts.startsAt, expiresAt: userBoosts.expiresAt,
    }).from(userBoosts).where(eq(userBoosts.userId, input.userId)).orderBy(desc(userBoosts.startsAt)).limit(20);
    const [giftSummary] = await ctx.db.select({
      sentCount: sql<number>`count(*) FILTER (WHERE ${gifts.fromId} = ${input.userId})::int`,
      receivedCount: sql<number>`count(*) FILTER (WHERE ${gifts.toId} = ${input.userId})::int`,
      starsSent: sql<number>`COALESCE(sum(${gifts.stars}) FILTER (WHERE ${gifts.fromId} = ${input.userId}), 0)::int`,
    }).from(gifts).where(or(eq(gifts.fromId, input.userId), eq(gifts.toId, input.userId)));
    // Two one-sided queries rather than one aliased join: the counterparty is either end of
    // the row, and an OR join would count every gift twice.
    const giftsSent = await ctx.db.select({
      id: gifts.id, sku: gifts.sku, stars: gifts.stars, createdAt: gifts.createdAt, partner: users.displayName,
    }).from(gifts).innerJoin(users, eq(users.id, gifts.toId))
      .where(eq(gifts.fromId, input.userId)).orderBy(desc(gifts.createdAt)).limit(5);
    const giftsReceived = await ctx.db.select({
      id: gifts.id, sku: gifts.sku, stars: gifts.stars, createdAt: gifts.createdAt, partner: users.displayName,
    }).from(gifts).innerJoin(users, eq(users.id, gifts.fromId))
      .where(eq(gifts.toId, input.userId)).orderBy(desc(gifts.createdAt)).limit(5);

    return { profile, entitlement: entitlement ?? null, intents, charges, boosts,
      gifts: { ...giftSummary, sent: giftsSent, received: giftsReceived } };
  }),

  // A console grant is additive: it extends the window and never relabels time the user paid
  // for. A row born from `source='stars'` keeps that source and its Telegram charge id, because
  // the renewal in engine/core.ts and payments/router.ts both key off them.
  setEntitlement: adminProcedure.input(setEntitlementSchema).mutation(async ({ ctx, input }) => {
    if (ctx.user.id === input.userId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot change your own entitlement.' });
    }
    const now = new Date();
    const expiresAt = await ctx.db.transaction(async (tx: any) => {
      const [target] = await tx.select({ id: users.id }).from(users)
        .where(eq(users.id, input.userId)).for('update').limit(1);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

      const [current] = await tx.select().from(userEntitlements)
        .where(eq(userEntitlements.userId, input.userId)).limit(1);
      if (current?.source === 'stars' && current.plan !== input.plan) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'План куплено в Telegram Stars — змінити його може лише charge. Тут доступне продовження того самого плану.',
        });
      }

      const source = current?.source ?? 'admin';
      const startsAt = current?.startsAt ?? now;
      const grantStartsAt = current?.expiresAt && current.expiresAt > now ? current.expiresAt : now;
      const grantExpiresAt = new Date(grantStartsAt.getTime() + input.days * 24 * 60 * 60 * 1000);

      await tx.insert(userEntitlements).values({
        userId: input.userId,
        plan: input.plan,
        source,
        status: 'active',
        startsAt,
        expiresAt: grantExpiresAt,
        telegramSubscriptionChargeId: current?.telegramSubscriptionChargeId ?? null,
        cancelledAt: null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: userEntitlements.userId,
        set: { plan: input.plan, source, status: 'active', expiresAt: grantExpiresAt, cancelledAt: null, updatedAt: now },
      });

      await tx.insert(adminAuditLogs).values({
        actorUserId: ctx.user.id,
        targetUserId: input.userId,
        action: 'user.entitlement.set',
        reason: input.reason,
        metadata: {
          plan: input.plan,
          days: input.days,
          source,
          expiresAt: grantExpiresAt.toISOString(),
          previousPlan: current?.plan ?? null,
          previousExpiresAt: current?.expiresAt?.toISOString() ?? null,
        },
      });
      return grantExpiresAt;
    });
    return { ok: true, expiresAt };
  }),

  // Refused for Stars rows on purpose: setting `cancelled` here would stop the app from
  // honouring a subscription while Telegram keeps charging it. The real cancel path is
  // payments.cancelStarSubscription, which talks to Telegram first.
  cancelEntitlement: adminProcedure.input(cancelEntitlementSchema).mutation(async ({ ctx, input }) => {
    const now = new Date();
    await ctx.db.transaction(async (tx: any) => {
      const [current] = await tx.select().from(userEntitlements)
        .where(eq(userEntitlements.userId, input.userId)).limit(1);
      if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'This account has no entitlement to cancel.' });
      if (current.source === 'stars') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Підписку оформлено в Telegram Stars — скасовувати її треба через charge, інакше списання триватиме.',
        });
      }
      await tx.update(userEntitlements).set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
        .where(eq(userEntitlements.userId, input.userId));
      await tx.insert(adminAuditLogs).values({
        actorUserId: ctx.user.id, targetUserId: input.userId, action: 'user.entitlement.cancel',
        reason: input.note, metadata: { plan: current.plan, previousExpiresAt: current.expiresAt.toISOString() },
      });
    });
    return { ok: true };
  }),

  // sessionVersion is what `isAuthed` in trpc.ts compares against the JWT, and there is no
  // refresh flow, so bumping it ends every live token for the account in one write.
  forceLogout: adminProcedure.input(forceLogoutSchema).mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.db.update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, input.userId))
      .returning({ sessionVersion: users.sessionVersion });
    if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
    await ctx.db.insert(adminAuditLogs).values({
      actorUserId: ctx.user.id, targetUserId: input.userId, action: 'user.session.invalidate',
      reason: input.reason, metadata: { sessionVersion: updated.sessionVersion },
    });
    return { ok: true, sessionVersion: updated.sessionVersion };
  }),

  updateUserProfile: adminProcedure.input(z.object({
    userId: z.string().uuid(),
    patch: profilePatchSchema,
    reason: z.string().trim().min(8).max(500),
  })).mutation(async ({ ctx, input }) => {
    await ctx.db.transaction(async (tx: any) => {
      const [target] = await tx.select({ id: users.id }).from(users)
        .where(eq(users.id, input.userId)).for('update').limit(1);
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

      const changes: Record<string, unknown> = { fields: Object.keys(input.patch) };
      if (input.patch.photos) {
        const approved = await tx.select({ publicUrl: photoAssets.publicUrl }).from(photoAssets)
          .where(and(eq(photoAssets.userId, input.userId), eq(photoAssets.moderationStatus, 'approved')));
        const allowed = new Set(approved.map((asset: { publicUrl: string }) => asset.publicUrl));
        const unknown = input.patch.photos.filter((url: string) => !allowed.has(url));
        if (unknown.length) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Профіль може показувати лише фото, що вже пройшли модерацію: ${unknown.length} зайвих URL.`,
          });
        }
        changes.photoCount = input.patch.photos.length;
      }

      await tx.update(users).set({
        displayName: input.patch.displayName,
        city: input.patch.city,
        bio: input.patch.bio,
        birthdate: input.patch.birthdate ? new Date(`${input.patch.birthdate}T00:00:00Z`) : undefined,
        photos: input.patch.photos,
      }).where(eq(users.id, input.userId));

      await tx.insert(adminAuditLogs).values({
        actorUserId: ctx.user.id, targetUserId: input.userId, action: 'user.profile.update',
        reason: input.reason, metadata: changes,
      });
    });
    return { ok: true };
  }),

  userContent: adminProcedure.input(userContentSchema).query(async ({ ctx, input }) => {
    const [profile] = await ctx.db.select({
      id: users.id, displayName: users.displayName, gender: users.gender, city: users.city,
      birthdate: users.birthdate, bio: users.bio, quote: users.quote,
      promptOne: users.promptOne, promptTwo: users.promptTwo, promptThree: users.promptThree,
      interests: users.interests, photos: users.photos, telegramUsername: users.telegramUsername,
      createdAt: users.createdAt, lastActiveAt: users.lastActiveAt,
      onboardingCompletedAt: users.onboardingCompletedAt, verifiedAt: users.verifiedAt,
      bannedAt: users.bannedAt, shadowbannedAt: users.shadowbannedAt, sessionVersion: users.sessionVersion,
      xp: users.xp, level: users.level,
    }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

    const assetFilter = eq(photoAssets.userId, input.userId);
    const [assetsTotal] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(photoAssets).where(assetFilter);
    const assets = await ctx.db.select({
      id: photoAssets.id, publicUrl: photoAssets.publicUrl, width: photoAssets.width, height: photoAssets.height,
      moderationStatus: photoAssets.moderationStatus, moderationScore: photoAssets.moderationScore,
      moderationProvider: photoAssets.moderationProvider, moderationNote: photoAssets.moderationNote,
      createdAt: photoAssets.createdAt, moderatedAt: photoAssets.moderatedAt,
    }).from(photoAssets).where(assetFilter).orderBy(desc(photoAssets.createdAt))
      .limit(input.limit).offset(input.offset);

    const [matchCount] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(matches)
      .where(or(eq(matches.userOneId, input.userId), eq(matches.userTwoId, input.userId)));
    const [sentCount] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(messages)
      .where(eq(messages.senderId, input.userId));
    const [receivedCount] = await ctx.db.select({ count: sql<number>`count(*)::int` }).from(messages)
      .innerJoin(matches, eq(matches.id, messages.matchId))
      .where(and(or(eq(matches.userOneId, input.userId), eq(matches.userTwoId, input.userId)), sql`${messages.senderId} <> ${input.userId}`));
    const recentMessages = await ctx.db.select({
      id: messages.id, matchId: messages.matchId, kind: messages.kind, body: messages.body, createdAt: messages.createdAt,
    }).from(messages).where(eq(messages.senderId, input.userId)).orderBy(desc(messages.id)).limit(10);

    const against = await ctx.db.select({
      id: reports.id, reason: reports.reason, details: reports.details, status: reports.status,
      createdAt: reports.createdAt, reporterId: users.id, reporterName: users.displayName,
    }).from(reports).innerJoin(users, eq(users.id, reports.reporterId))
      .where(eq(reports.reportedUserId, input.userId)).orderBy(desc(reports.createdAt)).limit(10);
    const filed = await ctx.db.select({
      id: reports.id, reason: reports.reason, details: reports.details, status: reports.status,
      createdAt: reports.createdAt, reportedUserId: users.id, reportedName: users.displayName,
    }).from(reports).innerJoin(users, eq(users.id, reports.reportedUserId))
      .where(eq(reports.reporterId, input.userId)).orderBy(desc(reports.createdAt)).limit(10);

    const tickets = await ctx.db.select({
      id: supportTickets.id, subject: supportTickets.subject, category: supportTickets.category,
      status: supportTickets.status, priority: supportTickets.priority,
      createdAt: supportTickets.createdAt, updatedAt: supportTickets.updatedAt, closedAt: supportTickets.closedAt,
    }).from(supportTickets).where(eq(supportTickets.userId, input.userId))
      .orderBy(desc(supportTickets.updatedAt)).limit(10);

    return {
      profile,
      photos: { total: assetsTotal.count, rows: assets },
      activity: { matches: matchCount.count, sent: sentCount.count, received: receivedCount.count, recent: recentMessages },
      reports: { against, filed },
      tickets,
    };
  }),

  // ------------------------------------------------------------------- ріст

  // Дні заповнюються в JS, а не в SQL: рядок «30 днів» має мати 30 значень, навіть коли в
  // той день ніхто нічого не написав, інакше графік бреше про провали.
  metrics: adminProcedure.input(metricsSchema).query(async ({ ctx, input }) => {
    const since = sql`now() - make_interval(days => ${input.days - 1}::int)`;
    const perDay = async (table: any, column: any, condition?: any) => {
      const rows = await ctx.db
        .select({ day: utcDay(column), count: sql<number>`count(*)::int` })
        .from(table)
        .where(condition ? and(gte(column, since), condition) : gte(column, since))
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      return rows as { day: string; count: number }[];
    };
    const fill = (rows: { day: string; count: number }[]) => {
      const byDay = new Map(rows.map((row) => [row.day, row.count]));
      return Array.from({ length: input.days }, (_, index) => {
        const day = new Date(Date.now() - (input.days - 1 - index) * 86_400_000).toISOString().slice(0, 10);
        return { day, count: byDay.get(day) ?? 0 };
      });
    };

    const [accounts] = await ctx.db.select({
      total: sql<number>`count(*)::int`,
      onboarded: sql<number>`count(*) FILTER (WHERE ${users.onboardingCompletedAt} IS NOT NULL)::int`,
      banned: sql<number>`count(*) FILTER (WHERE ${users.bannedAt} IS NOT NULL)::int`,
      shadowbanned: sql<number>`count(*) FILTER (WHERE ${users.shadowbannedAt} IS NOT NULL)::int`,
      withPhoto: sql<number>`count(*) FILTER (WHERE coalesce(array_length(${users.photos}, 1), 0) > 0)::int`,
      withMatch: sql<number>`count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM ${matches} WHERE ${matches.userOneId} = ${outerUserId} OR ${matches.userTwoId} = ${outerUserId}
      ))::int`,
      withMessage: sql<number>`count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM ${messages} WHERE ${messages.senderId} = ${outerUserId}
      ))::int`,
    }).from(users);

    const [activity] = await ctx.db.select({
      matches: sql<number>`count(*)::int`,
    }).from(matches);
    const [written] = await ctx.db.select({
      messages: sql<number>`count(*)::int`,
      read: sql<number>`count(*) FILTER (WHERE ${messages.readAt} IS NOT NULL)::int`,
    }).from(messages);

    const [moderation] = await ctx.db.select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) FILTER (WHERE ${photoAssets.moderationStatus} = 'pending')::int`,
      approved: sql<number>`count(*) FILTER (WHERE ${photoAssets.moderationStatus} = 'approved')::int`,
      rejected: sql<number>`count(*) FILTER (WHERE ${photoAssets.moderationStatus} = 'rejected')::int`,
      scored: sql<number>`count(*) FILTER (WHERE ${photoAssets.moderationScore} IS NOT NULL)::int`,
    }).from(photoAssets);
    const providers = await ctx.db.select({
      provider: photoAssets.moderationProvider,
      count: sql<number>`count(*)::int`,
    }).from(photoAssets).groupBy(photoAssets.moderationProvider).orderBy(desc(sql`count(*)`));

    const [plans] = await ctx.db.select({
      active: sql<number>`count(*) FILTER (WHERE ${userEntitlements.status} = 'active' AND ${userEntitlements.expiresAt} > now())::int`,
      fromStars: sql<number>`count(*) FILTER (WHERE ${userEntitlements.source} = 'stars')::int`,
      fromAdmin: sql<number>`count(*) FILTER (WHERE ${userEntitlements.source} = 'admin')::int`,
      cancelled: sql<number>`count(*) FILTER (WHERE ${userEntitlements.status} = 'cancelled')::int`,
    }).from(userEntitlements);
    const [money] = await ctx.db.select({
      payers: sql<number>`count(DISTINCT ${telegramStarPayments.userId})::int`,
      stars: sql<number>`COALESCE(sum(${telegramStarPayments.totalAmount}), 0)::int`,
      charges: sql<number>`count(*)::int`,
    }).from(telegramStarPayments);

    const [support] = await ctx.db.select({
      open: sql<number>`count(*) FILTER (WHERE ${supportTickets.status} IN ('open', 'in_progress', 'waiting_user'))::int`,
      closed: sql<number>`count(*) FILTER (WHERE ${supportTickets.status} IN ('resolved', 'closed'))::int`,
    }).from(supportTickets);
    const [reportsTotals] = await ctx.db.select({
      open: sql<number>`count(*) FILTER (WHERE ${reports.status} IN ('open', 'reviewing'))::int`,
      closed: sql<number>`count(*) FILTER (WHERE ${reports.status} IN ('resolved', 'dismissed'))::int`,
    }).from(reports);
    const [devices] = await ctx.db.select({
      tokens: sql<number>`count(*)::int`,
      people: sql<number>`count(DISTINCT ${pushDevices.userId})::int`,
    }).from(pushDevices);

    return {
      window: { days: input.days },
      accounts,
      funnel: [
        { label: 'Реєстрації', value: accounts.total },
        { label: 'Пройшли онбординг', value: accounts.onboarded },
        { label: 'Мають фото', value: accounts.withPhoto },
        { label: 'Мають матч', value: accounts.withMatch },
        { label: 'Щось написали', value: accounts.withMessage },
      ],
      activity: { matches: activity.matches, messages: written.messages, read: written.read },
      moderation,
      providers: providers.map((row: { provider: string | null; count: number }) => ({
        provider: row.provider ?? '—', count: row.count,
      })),
      plans,
      money,
      support,
      reports: reportsTotals,
      push: devices,
      series: {
        signups: fill(await perDay(users, users.createdAt)),
        lastActive: fill(await perDay(users, users.lastActiveAt)),
        matches: fill(await perDay(matches, matches.createdAt)),
        messages: fill(await perDay(messages, messages.createdAt)),
        photos: fill(await perDay(photoAssets, photoAssets.createdAt)),
        rejectedPhotos: fill(await perDay(photoAssets, photoAssets.createdAt, eq(photoAssets.moderationStatus, 'rejected'))),
      },
    };
  }),

  pushRecipients: adminProcedure.input(pushAudienceSchema).query(async ({ ctx, input }) => {
    const rows = await recipientRows(ctx.db, input, MAX_BROADCAST_TOKENS + 1);
    return {
      audience: input.audience,
      days: input.days,
      cap: MAX_BROADCAST_TOKENS,
      ...summariseRecipients(rows),
      truncated: rows.length > MAX_BROADCAST_TOKENS,
    };
  }),

  // Зворотного ходу в розсилки немає, тому `dryRun` — типове значення, а межа адресатів
  // відмовляє ще до першого запиту до Expo.
  pushBroadcast: adminProcedure.input(pushBroadcastSchema).mutation(async ({ ctx, input }) => {
    const rows = await recipientRows(ctx.db, input, MAX_BROADCAST_TOKENS + 1);
    const summary = summariseRecipients(rows);
    if (rows.length > MAX_BROADCAST_TOKENS) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Аудиторія перевищує ${MAX_BROADCAST_TOKENS} адресатів на один виклик — звузьте фільтр.`,
      });
    }
    const targets = rows.filter((row) => EXPO_TOKEN_RE.test(row.pushToken))
      .map((row) => ({ userId: row.userId, pushToken: row.pushToken, timeZone: row.timeZone }));
    // Прев'ю рахує те саме, що відправило б, але не дзвонить у Expo.
    const outcome = input.dryRun
      ? { recipients: targets.length, quiet: summary.quiet, accepted: 0, dropped: 0 }
      : await notifyBroadcast(ctx.db, { title: input.title, body: input.body }, targets);
    if (!input.dryRun) {
      await ctx.db.insert(adminAuditLogs).values({
        actorUserId: ctx.user.id,
        action: 'push.broadcast',
        reason: input.reason,
        metadata: {
          audience: input.audience,
          days: input.days,
          title: input.title,
          body: input.body,
          recipients: outcome.recipients,
          quiet: outcome.quiet,
          accepted: outcome.accepted,
          dropped: outcome.dropped,
        },
      });
    }
    // Dry run і справжня розсилка повертають той самий набір полів: `dryRun` — єдине, що їх
    // розрізняє, тож клієнту не треба вгадувати форму response.
    return {
      dryRun: input.dryRun,
      audience: input.audience,
      days: input.days,
      devices: summary.devices,
      sendable: summary.sendable,
      malformed: summary.malformed,
      ...outcome,
    };
  }),
});
