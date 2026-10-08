import { TRPCError } from '@trpc/server';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { adminAuditLogs, paymentIntents, photoAssets, reports, telegramStarPayments, users } from '@constella/db';
import { z } from 'zod';
import { adminProcedure, isConfiguredAdmin, protectedProcedure, router } from '../trpc.js';
import { removePhotoObjects } from '../photos/storage.js';

const pageInput = z.object({ limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0) });
const ageSql = sql<number>`EXTRACT(YEAR FROM AGE(CURRENT_DATE, ${users.birthdate}))::int`;

export const adminRouter = router({
  access: protectedProcedure.query(({ ctx }) => ({ isAdmin: isConfiguredAdmin(ctx.user) })),

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
    }).from(users).where(filter).orderBy(desc(users.createdAt)).limit(input.limit).offset(input.offset);
    return { total: total.count, rows };
  }),

  reports: adminProcedure.input(pageInput.extend({ status: z.enum(['all', 'open', 'reviewing', 'resolved', 'dismissed']).default('open') }))
    .query(async ({ ctx, input }) => {
      const statusFilter = input.status === 'all' ? undefined : eq(reports.status, input.status);
      const rows = await ctx.db.select({
        id: reports.id, reason: reports.reason, details: reports.details, status: reports.status,
        createdAt: reports.createdAt, moderatorNote: reports.moderatorNote,
        reporterId: users.id, reportedUserId: reports.reportedUserId,
        reporterName: users.displayName,
      }).from(reports).innerJoin(users, eq(users.id, reports.reporterId))
        .where(statusFilter).orderBy(desc(reports.createdAt)).limit(input.limit).offset(input.offset);
      return rows;
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


  photoQueue: adminProcedure.input(pageInput.extend({ status: z.enum(['pending','approved','rejected']).default('pending') }))
    .query(async ({ ctx, input }) => ctx.db.select({
      id: photoAssets.id, userId: photoAssets.userId, displayName: users.displayName,
      publicUrl: photoAssets.publicUrl, width: photoAssets.width, height: photoAssets.height,
      moderationScore: photoAssets.moderationScore, moderationProvider: photoAssets.moderationProvider,
      moderationStatus: photoAssets.moderationStatus, createdAt: photoAssets.createdAt,
    }).from(photoAssets).innerJoin(users, eq(users.id, photoAssets.userId))
      .where(eq(photoAssets.moderationStatus, input.status)).orderBy(desc(photoAssets.createdAt))
      .limit(input.limit).offset(input.offset)),

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

  payments: adminProcedure.input(pageInput).query(async ({ ctx, input }) =>
    ctx.db.select({
      id: telegramStarPayments.id, paidAt: telegramStarPayments.paidAt,
      stars: telegramStarPayments.totalAmount, currency: telegramStarPayments.currency,
      recurring: telegramStarPayments.isRecurring, sku: paymentIntents.sku,
      plan: paymentIntents.plan, userId: telegramStarPayments.userId,
      displayName: users.displayName,
    }).from(telegramStarPayments)
      .innerJoin(paymentIntents, eq(paymentIntents.id, telegramStarPayments.paymentIntentId))
      .innerJoin(users, eq(users.id, telegramStarPayments.userId))
      .orderBy(desc(telegramStarPayments.paidAt)).limit(input.limit).offset(input.offset)
  ),

  audit: adminProcedure.input(pageInput).query(async ({ ctx, input }) =>
    ctx.db.select({
      id: adminAuditLogs.id, action: adminAuditLogs.action, reason: adminAuditLogs.reason,
      metadata: adminAuditLogs.metadata, createdAt: adminAuditLogs.createdAt,
      actorId: adminAuditLogs.actorUserId, actorName: users.displayName,
      targetUserId: adminAuditLogs.targetUserId, reportId: adminAuditLogs.reportId,
    }).from(adminAuditLogs).innerJoin(users, eq(users.id, adminAuditLogs.actorUserId))
      .orderBy(desc(adminAuditLogs.createdAt)).limit(input.limit).offset(input.offset)
  ),
});
