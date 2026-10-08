import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TelegramInitDataSchema, TelegramUserSchema } from './telegram.js';

describe('Telegram payload schemas', () => {
  it('accepts valid user fields and optional Telegram metadata', () => {
    assert.equal(TelegramUserSchema.safeParse({ id: 123, first_name: 'Alex', is_premium: true }).success, true);
  });
  it('rejects invalid identifiers and malformed optional fields', () => {
    assert.equal(TelegramUserSchema.safeParse({ id: '123', first_name: 'Alex' }).success, false);
    assert.equal(TelegramUserSchema.safeParse({ id: 123, first_name: 'Alex', is_premium: 'yes' }).success, false);
  });
  it('requires a hash in initData', () => {
    assert.equal(TelegramInitDataSchema.safeParse({ hash: 'a'.repeat(64), auth_date: 1 }).success, true);
    assert.equal(TelegramInitDataSchema.safeParse({ auth_date: 1 }).success, false);
  });
});
