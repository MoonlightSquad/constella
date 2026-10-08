import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { identities, paymentIntents, userBoosts, userEntitlements, users } from '@constella/db';
import { CreateStarInvoiceSchema, STAR_PRODUCTS, isVipPlan } from '@constella/shared';
import { protectedProcedure, router } from '../trpc.js';
import { hasVip } from '../engine/core.js';
import { cancelTelegramStarSubscription, createTelegramStarInvoiceLink } from './telegramStars.js';

const requireTelegramIdentity = async (db: any, userId: string, telegramId: number | null) => {
  if (!telegramId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Open Constella in Telegram to purchase with Stars.',
    });
  }
  const [identity] = await db
    .select({ userId: identities.userId })
    .from(identities)
    .where(
      and(
        eq(identities.provider, 'telegram'),
        eq(identities.providerUid, String(telegramId)),
        eq(identities.userId, userId)
      )
    )
    .limit(1);
  if (!identity) {
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
    const now = new Date();
    return {
      telegramAvailable: Boolean(ctx.user.telegramId),
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
