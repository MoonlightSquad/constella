import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CreateStarInvoiceSchema, PreCheckoutSchema, SuccessfulStarPaymentSchema, isVipPlan, STAR_PRODUCTS } from './billing.js';

describe('Telegram Stars purchase schemas', () => {
  it('accepts every catalog SKU but never accepts client-controlled prices', () => {
    for (const sku of Object.keys(STAR_PRODUCTS)) assert.equal(CreateStarInvoiceSchema.safeParse({ sku }).success, true);
    const result = CreateStarInvoiceSchema.parse({ sku: 'vip', stars: 1 });
    assert.equal('stars' in result, false);
  });
  it('validates gift targets and note length', () => {
    assert.equal(CreateStarInvoiceSchema.safeParse({ sku: 'gift_rose', giftToUserId: 'invalid' }).success, false);
    assert.equal(CreateStarInvoiceSchema.safeParse({ sku: 'superlike', note: 'x'.repeat(181) }).success, false);
  });
  it('accepts only positive XTR pre-checkouts', () => {
    const base = { invoicePayload: '123e4567-e89b-12d3-a456-426614174000', telegramUserId: 42, currency: 'XTR', totalAmount: 25 };
    assert.equal(PreCheckoutSchema.safeParse(base).success, true);
    assert.equal(PreCheckoutSchema.safeParse({ ...base, currency: 'USD' }).success, false);
    assert.equal(PreCheckoutSchema.safeParse({ ...base, totalAmount: 0 }).success, false);
  });
  it('requires Telegram charge id and defaults recurring flags', () => {
    const base = { invoicePayload: '123e4567-e89b-12d3-a456-426614174000', telegramUserId: 42, currency: 'XTR', totalAmount: 499 };
    const result = SuccessfulStarPaymentSchema.safeParse({ ...base, telegramPaymentChargeId: 'charge-1' });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.isRecurring, false);
    assert.equal(SuccessfulStarPaymentSchema.safeParse(base).success, false);
  });
  it('recognizes supported VIP aliases only', () => {
    for (const plan of ['vip', 'plus', 'prime']) assert.equal(isVipPlan(plan), true);
    assert.equal(isVipPlan('free'), false);
    assert.equal(isVipPlan(null), false);
  });
});
