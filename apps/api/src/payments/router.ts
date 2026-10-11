import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { identities, paymentIntents, userBoosts, userEntitlements, users } from '@constella/db';
import { CreateStarInvoiceSchema, STAR_PRODUCTS, isVipPlan } from '@constella/shared';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';
import { hasVip } from '../engine/core.js';
import { cancelTelegramStarSubscription, createTelegramStarInvoiceLink } from './telegramStars.js';
import { verifyTelegramLoginWidget } from '../utils/telegram-login-widget.js';

const linkedTelegramId = async (db: any, userId: string) => {
  const [identity] = await db
    .select({ providerUid: identities.providerUid })
    .from(identities)
    .where(and(eq(identities.provider, 'telegram'), eq(identities.userId, userId)))
    .limit(1);
  if (!identity || !/^\d+$/.test(identity.providerUid)) return null;
  const telegramId = Number(identity.providerUid);
  return Number.isSafeInteger(telegramId) && telegramId > 0 ? telegramId : null;
};

const requireTelegramIdentity = async (db: any, userId: string, tokenTelegramId: number | null) => {
  const telegramId = await linkedTelegramId(db, userId);
  if (!telegramId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Link a Telegram account before purchasing with Stars.',
    });
  }
  if (tokenTelegramId !== null && tokenTelegramId !== telegramId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Telegram identity is not linked to this account.' });
  }
  return telegramId;
};

const requirePaymentConfiguration = () => {
  const secret = process.env.PAYMENTS_INTERNAL_TOKEN;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Stars payments are not configured on this server.' });
  }
};

export const billingRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const vip = await hasVip(ctx.db, ctx.user.id);
    const [entitlement] = await ctx.db.select().from(userEntitlements).where(eq(userEntitlements.userId, ctx.user.id)).limit(1);
    const [boost] = await ctx.db
      .select()
      .from(userBoosts)
      .where(and(eq(userBoosts.userId, ctx.user.id)))
      .orderBy(userBoosts.expiresAt)
      .limit(1);
    const [me] = await ctx.db
      .select({
        superlikeBalance: users.superlikeBalance,
        streakFreezes: users.streakFreezes,
        streakCount: users.streakCount,
        incognitoUntil: users.incognitoUntil,
        locationOverrideCity: users.locationOverrideCity,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    const telegramId = await linkedTelegramId(ctx.db, ctx.user.id);
    const now = new Date();
    return {
      telegramAvailable: Boolean(telegramId),
      telegramLinked: Boolean(telegramId),
      products: Object.values(STAR_PRODUCTS),
      vip,
      entitlement:
        vip && entitlement
          ? {
              plan: isVipPlan(entitlement.plan) ? 'vip' : entitlement.plan,
              status: entitlement.status,
              expiresAt: entitlement.expiresAt,
              renews: entitlement.status === 'active' && !entitlement.cancelledAt,
            }
          : null,
      boostActiveUntil: boost && boost.expiresAt > now ? boost.expiresAt : null,
      superlikeBalance: me?.superlikeBalance ?? 0,
      streakFreezes: me?.streakFreezes ?? 0,
      streakCount: me?.streakCount ?? 0,
      incognito: Boolean(me?.incognitoUntil && me.incognitoUntil > now),
      passportCity: me?.locationOverrideCity ?? null,
    };
  }),

  linkTelegram: protectedProcedure.input(
    z.object({
      id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      first_name: z.string().min(1).max(256),
      last_name: z.string().max(256).optional(),
      username: z.string().max(64).optional(),
      photo_url: z.string().url().max(2048).optional(),
      auth_date: z.number().int().positive(),
      hash: z.string().regex(/^[a-f\d]{64}$/i),
      allows_write_to_pm: z.boolean().optional(),
    }).strict()
  ).mutation(async ({ ctx, input }) => {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Telegram account linking is not configured.' });
    }

    let telegramId: number;
    try {
      ({ telegramId } = verifyTelegramLoginWidget(input, botToken));
    } catch (error) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: error instanceof Error ? error.message : 'Telegram account verification failed.',
      });
    }

    const providerUid = String(telegramId);
    const [existingIdentity] = await ctx.db
      .select({ userId: identities.userId })
      .from(identities)
      .where(and(eq(identities.provider, 'telegram'), eq(identities.providerUid, providerUid)))
      .limit(1);
    if (existingIdentity) {
      if (existingIdentity.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This Telegram account is already linked to another Constella account.' });
      }
      return { ok: true, alreadyLinked: true };
    }

    const [createdIdentity] = await ctx.db
      .insert(identities)
      .values({ provider: 'telegram', providerUid, userId: ctx.user.id })
      .onConflictDoNothing()
      .returning({ userId: identities.userId });
    if (createdIdentity) return { ok: true, alreadyLinked: false };

    const [conflictingIdentity] = await ctx.db
      .select({ userId: identities.userId })
      .from(identities)
      .where(and(eq(identities.provider, 'telegram'), eq(identities.providerUid, providerUid)))
      .limit(1);
    if (conflictingIdentity?.userId !== ctx.user.id) {
      throw new TRPCError({ code: 'CONFLICT', message: 'This Telegram account is already linked to another Constella account.' });
    }
    return { ok: true, alreadyLinked: true };
  }),

  createInvoice: protectedProcedure.input(CreateStarInvoiceSchema).mutation(async ({ ctx, input }) => {
    requirePaymentConfiguration();
    const telegramId = await requireTelegramIdentity(ctx.db, ctx.user.id, ctx.user.telegramId);
    const product = STAR_PRODUCTS[input.sku];
    if (product.kind === 'gift') {
      if (!input.giftToUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose a profile to send this gift to.' });
      }
      if (input.giftToUserId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot send a gift to yourself.' });
      }
      const [recipient] = await ctx.db
        .select({ id: users.id, completed: users.onboardingCompletedAt })
        .from(users)
        .where(eq(users.id, input.giftToUserId))
        .limit(1);
      if (!recipient?.completed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'This profile is not available for gifts.' });
      }
    }
    const now = new Date();
    if (input.sku === 'vip' && (await hasVip(ctx.db, ctx.user.id))) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'VIP is already active on this account.' });
    }

    await ctx.db
      .update(paymentIntents)
      .set({ status: 'cancelled' })
      .where(and(eq(paymentIntents.userId, ctx.user.id), eq(paymentIntents.status, 'pending')));

    const payload = randomUUID();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    await ctx.db.insert(paymentIntents).values({
      payload,
      userId: ctx.user.id,
      telegramUserId: String(telegramId),
      sku: input.sku,
      plan: input.sku === 'vip' ? 'vip' : null,
      currency: 'XTR',
      totalAmount: product.stars,
      status: 'pending',
      meta: { giftToUserId: input.giftToUserId, note: input.note, stars: product.stars },
      expiresAt,
    });

    try {
      const invoiceLink = await createTelegramStarInvoiceLink(payload, input.sku);
      return { invoiceLink, sku: input.sku, currency: 'XTR' as const, amount: product.stars, expiresAt };
    } catch (error) {
      await ctx.db.update(paymentIntents).set({ status: 'failed' }).where(eq(paymentIntents.payload, payload));
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Telegram could not create an invoice.',
      });
    }
  }),

  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    requirePaymentConfiguration();
    const telegramId = await requireTelegramIdentity(ctx.db, ctx.user.id, ctx.user.telegramId);
    const [entitlement] = await ctx.db.select().from(userEntitlements).where(eq(userEntitlements.userId, ctx.user.id)).limit(1);
    if (!entitlement?.telegramSubscriptionChargeId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No cancellable Stars subscription was found.' });
    }
    if (entitlement.cancelledAt || entitlement.expiresAt <= new Date()) {
      return { ok: true, expiresAt: entitlement.expiresAt };
    }
    try {
      await cancelTelegramStarSubscription(telegramId, entitlement.telegramSubscriptionChargeId);
    } catch (error) {
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Telegram could not cancel the subscription.',
      });
    }
    const cancelledAt = new Date();
    await ctx.db
      .update(userEntitlements)
      .set({ status: 'cancelled', cancelledAt, updatedAt: cancelledAt })
      .where(eq(userEntitlements.userId, ctx.user.id));
    return { ok: true, expiresAt: entitlement.expiresAt };
  }),
});
