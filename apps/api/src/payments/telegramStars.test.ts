import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { cancelTelegramStarSubscription, createTelegramStarInvoiceLink } from './telegramStars.js';

const originalFetch = globalThis.fetch;
const originalToken = process.env.BOT_TOKEN;
after(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.BOT_TOKEN;
  else process.env.BOT_TOKEN = originalToken;
});

describe('Telegram Stars API adapter', () => {
  it('creates recurring VIP invoices with the server catalog amount', async () => {
    process.env.BOT_TOKEN = 'test-token';
    let body: any;
    globalThis.fetch = (async (_url: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, result: 'https://t.me/invoice' }), { status: 200 });
    }) as typeof fetch;
    assert.equal(await createTelegramStarInvoiceLink('invoice-id', 'vip'), 'https://t.me/invoice');
    assert.equal(body.currency, 'XTR');
    assert.equal(body.prices[0].amount, 499);
    assert.equal(body.subscription_period, 2_592_000);
  });
  it('does not attach a recurring period to consumables', async () => {
    process.env.BOT_TOKEN = 'test-token';
    let body: any;
    globalThis.fetch = (async (_url: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, result: 'https://t.me/invoice' }), { status: 200 });
    }) as typeof fetch;
    await createTelegramStarInvoiceLink('invoice-id', 'boost');
    assert.equal(body.prices[0].amount, 100);
    assert.equal('subscription_period' in body, false);
  });
  it('rejects unconfigured and failed Telegram requests', async () => {
    delete process.env.BOT_TOKEN;
    await assert.rejects(createTelegramStarInvoiceLink('invoice-id', 'vip'), /BOT_TOKEN/);
    process.env.BOT_TOKEN = 'test-token';
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false, description: 'rejected' }), { status: 400 })) as typeof fetch;
    await assert.rejects(createTelegramStarInvoiceLink('invoice-id', 'vip'), /rejected/);
  });
  it('cancels a subscription by Telegram charge id', async () => {
    process.env.BOT_TOKEN = 'test-token';
    let body: any;
    globalThis.fetch = (async (_url: any, init: any) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    }) as typeof fetch;
    assert.equal(await cancelTelegramStarSubscription(123, 'charge-abc'), true);
    assert.deepEqual(body, { user_id: 123, telegram_payment_charge_id: 'charge-abc', is_canceled: true });
  });
});
