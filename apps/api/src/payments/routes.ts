import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { identities, paymentIntents, telegramStarPayments, userEntitlements } from '@constella/db';
import { PreCheckoutSchema, SuccessfulStarPaymentSchema, TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS } from '@constella/shared';
import { db } from '@constella/db';
import { createLogger } from '@constella/shared';
import { applyPurchase, notifyTelegram } from '../engine/core.js';

const logger = createLogger('payments');
const telegramDateToDate = (timestamp: number) => new Date(timestamp * 1000);

const hasInternalPaymentToken = (request: FastifyRequest) => {
  const expected = process.env.PAYMENTS_INTERNAL_TOKEN;
  const provided = request.headers['x-payments-token'];
  if (!expected || Buffer.byteLength(expected) < 32 || typeof provided !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
};

const paymentError = (message: string) => ({ ok: false, errorMessage: message });

export const registerTelegramPaymentRoutes = (fastify: FastifyInstance) => {
  fastify.post('/internal/payments/pre-checkout', { schema: { tags: ['Payments'], summary: 'Validate a Telegram Stars pre-checkout', security: [{ paymentsToken: [] }], body: { type: 'object', required: ['invoicePayload', 'telegramUserId', 'currency', 'totalAmount'], properties: { invoicePayload: { type: 'string' }, telegramUserId: { type: 'integer' }, currency: { type: 'string', enum: ['XTR'] }, totalAmount: { type: 'integer', minimum: 1 } }, additionalProperties: true } } }, async (request, reply) => {
    if (!hasInternalPaymentToken(request)) return reply.status(401).send({ error: 'Unauthorized.' });
    const parsed = PreCheckoutSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(paymentError('Invalid invoice details.'));

    const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.payload, parsed.data.invoicePayload)).limit(1);
    if (
      !intent ||
      !intent.userId ||
      intent.telegramUserId !== String(parsed.data.telegramUserId) ||
      intent.currency !== parsed.data.currency ||
      intent.totalAmount !== parsed.data.totalAmount
    ) {
      return reply.send(paymentError('This invoice does not match your account or its price.'));
    }

    const [identity] = await db
      .select({ userId: identities.userId })
      .from(identities)
      .where(
        and(
          eq(identities.provider, 'telegram'),
          eq(identities.providerUid, String(parsed.data.telegramUserId)),
          eq(identities.userId, intent.userId)
        )
      )
      .limit(1);
    if (!identity) return reply.send(paymentError('This Telegram account is not linked to the invoice.'));

    const now = new Date();
    if (intent.status === 'pending' && intent.expiresAt > now) return reply.send({ ok: true });
    if (intent.status === 'paid' && (intent.sku === 'vip' || intent.plan)) {
      const [entitlement] = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, intent.userId)).limit(1);
      if (entitlement?.status === 'active' && entitlement.expiresAt > now) return reply.send({ ok: true });
    }
    return reply.send(paymentError('This invoice has expired. Create a new invoice in Constella.'));
  });

  fastify.post('/internal/payments/successful-payment', { schema: { tags: ['Payments'], summary: 'Record a successful Telegram Stars payment', security: [{ paymentsToken: [] }], body: { type: 'object', required: ['invoicePayload', 'telegramUserId', 'currency', 'totalAmount', 'telegramPaymentChargeId', 'providerPaymentChargeId'], properties: { invoicePayload: { type: 'string' }, telegramUserId: { type: 'integer' }, currency: { type: 'string', enum: ['XTR'] }, totalAmount: { type: 'integer', minimum: 1 }, telegramPaymentChargeId: { type: 'string' }, providerPaymentChargeId: { type: 'string' }, isRecurring: { type: 'boolean' }, isFirstRecurring: { type: 'boolean' }, subscriptionExpirationDate: { type: 'integer' } }, additionalProperties: true } } }, async (request, reply) => {
    if (!hasInternalPaymentToken(request)) return reply.status(401).send({ error: 'Unauthorized.' });
    const parsed = SuccessfulStarPaymentSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid successful payment payload.' });
    const payment = parsed.data;

    try {
      const result = await db.transaction(async (tx) => {
        const [existingPayment] = await tx
          .select()
          .from(telegramStarPayments)
          .where(eq(telegramStarPayments.telegramPaymentChargeId, payment.telegramPaymentChargeId))
          .limit(1);
        if (existingPayment) return { duplicate: true, userId: existingPayment.userId, sku: 'unknown' };

        const [intent] = await tx.select().from(paymentIntents).where(eq(paymentIntents.payload, payment.invoicePayload)).limit(1);
        if (
          !intent ||
          !intent.userId ||
          intent.telegramUserId !== String(payment.telegramUserId) ||
          intent.currency !== payment.currency ||
          intent.totalAmount !== payment.totalAmount ||
          !['pending', 'paid'].includes(intent.status)
        ) {
          throw new Error('Payment does not match a valid invoice intent.');
        }

        const [receipt] = await tx
          .insert(telegramStarPayments)
          .values({
            paymentIntentId: intent.id,
            userId: intent.userId,
            telegramPaymentChargeId: payment.telegramPaymentChargeId,
            providerPaymentChargeId: payment.providerPaymentChargeId,
            currency: payment.currency,
            totalAmount: payment.totalAmount,
            isRecurring: payment.isRecurring,
            isFirstRecurring: payment.isFirstRecurring,
          })
          .onConflictDoNothing()
          .returning({ id: telegramStarPayments.id });
        if (!receipt) return { duplicate: true, userId: intent.userId, sku: intent.sku };

        const expirationDate = payment.subscriptionExpirationDate
          ? telegramDateToDate(payment.subscriptionExpirationDate)
          : payment.isRecurring
            ? new Date(Date.now() + TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS * 1000)
            : undefined;

        await tx.update(paymentIntents).set({ status: 'paid' }).where(eq(paymentIntents.id, intent.id));
        await applyPurchase(tx, intent.userId, intent.sku, intent.meta ?? {}, payment.telegramPaymentChargeId, expirationDate);
        return { duplicate: false, userId: intent.userId, sku: intent.sku };
      });

      logger.info('Telegram Stars payment recorded', result);
      if (!result.duplicate) {
        await notifyTelegram(String(payment.telegramUserId), `Оплату ${result.sku} підтверджено. Дякуємо! ⭐`);
      }
      return reply.send({ ok: true, duplicate: result.duplicate });
    } catch (error) {
      logger.error('Could not record Telegram Stars payment', {
        message: error instanceof Error ? error.message : 'Unknown payment error',
      });
      return reply.status(409).send({ error: 'Payment could not be matched to a valid Constella invoice.' });
    }
  });

  fastify.get('/internal/users/:telegramUserId/status', { schema: { tags: ['Payments'], summary: 'Get Telegram-linked account entitlements', security: [{ paymentsToken: [] }], params: { type: 'object', required: ['telegramUserId'], properties: { telegramUserId: { type: 'string' } } } } }, async (request, reply) => {
    if (!hasInternalPaymentToken(request)) return reply.status(401).send({ error: 'Unauthorized.' });
    const telegramUserId = String((request.params as { telegramUserId: string }).telegramUserId);
    const [identity] = await db
      .select()
      .from(identities)
      .where(and(eq(identities.provider, 'telegram'), eq(identities.providerUid, telegramUserId)))
      .limit(1);
    if (!identity) return reply.send({ linked: false });
    const [entitlement] = await db.select().from(userEntitlements).where(eq(userEntitlements.userId, identity.userId)).limit(1);
    const { users } = await import('@constella/db');
    const [me] = await db
      .select({
        superlikeBalance: users.superlikeBalance,
        streakCount: users.streakCount,
        streakFreezes: users.streakFreezes,
      })
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1);
    const vip = Boolean(entitlement && entitlement.expiresAt > new Date() && entitlement.status !== 'expired');
    return reply.send({
      linked: true,
      vip,
      expiresAt: vip ? entitlement?.expiresAt : null,
      superlikeBalance: me?.superlikeBalance ?? 0,
      streak: me?.streakCount ?? 0,
      freezes: me?.streakFreezes ?? 0,
    });
  });
};
