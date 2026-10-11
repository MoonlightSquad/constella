import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { grantVipSchema } from './admin.schemas.js';

const userId = '123e4567-e89b-12d3-a456-426614174000';

describe('admin VIP grant schema', () => {
  it('defaults to a 30-day grant and trims the audit reason', () => {
    assert.deepEqual(grantVipSchema.parse({ userId, reason: '  Support credit  ' }), {
      userId,
      days: 30,
      reason: 'Support credit',
    });
  });

  it('bounds duration and requires a valid target and reason', () => {
    assert.equal(grantVipSchema.safeParse({ userId, days: 365, reason: 'Valid support credit' }).success, true);
    assert.equal(grantVipSchema.safeParse({ userId, days: 0, reason: 'Valid support credit' }).success, false);
    assert.equal(grantVipSchema.safeParse({ userId, days: 366, reason: 'Valid support credit' }).success, false);
    assert.equal(grantVipSchema.safeParse({ userId, reason: 'short' }).success, false);
    assert.equal(grantVipSchema.safeParse({ userId: 'not-a-uuid', reason: 'Valid support credit' }).success, false);
  });
});
