import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cancelEntitlementSchema,
  forceLogoutSchema,
  grantVipSchema,
  metricsSchema,
  profilePatchSchema,
  pushAudienceSchema,
  pushBroadcastSchema,
  setEntitlementSchema,
  userContentSchema,
} from './admin.schemas.js';

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

describe('admin entitlement schemas', () => {
  it('requires an explicit plan and keeps the grant window bounded', () => {
    assert.deepEqual(setEntitlementSchema.parse({ userId, plan: 'plus', reason: 'Compensation for outage' }), {
      userId,
      plan: 'plus',
      days: 30,
      reason: 'Compensation for outage',
    });
    assert.equal(setEntitlementSchema.safeParse({ userId, plan: 'gold', days: 10, reason: 'Valid reason' }).success, false);
    assert.equal(setEntitlementSchema.safeParse({ userId, plan: 'vip', days: 400, reason: 'Valid reason' }).success, false);
  });

  it('requires a written justification for every entitlement and session change', () => {
    assert.equal(cancelEntitlementSchema.safeParse({ userId, note: 'User asked to stop renewal' }).success, true);
    assert.equal(cancelEntitlementSchema.safeParse({ userId, note: 'oops' }).success, false);
    assert.equal(forceLogoutSchema.safeParse({ userId, reason: 'Shared device, user requested' }).success, true);
    assert.equal(forceLogoutSchema.safeParse({ userId }).success, false);
  });

  it('paginates the content inspector inside the console page limits', () => {
    assert.deepEqual(userContentSchema.parse({ userId }), { userId, limit: 25, offset: 0 });
    assert.equal(userContentSchema.safeParse({ userId, limit: 101 }).success, false);
  });
});

describe('admin growth schemas', () => {
  it('keeps the metrics window inside a range the aggregates can serve', () => {
    assert.deepEqual(metricsSchema.parse({}), { days: 30 });
    assert.equal(metricsSchema.safeParse({ days: 7 }).success, true);
    assert.equal(metricsSchema.safeParse({ days: 90 }).success, true);
    assert.equal(metricsSchema.safeParse({ days: 6 }).success, false);
    assert.equal(metricsSchema.safeParse({ days: 400 }).success, false);
  });

  it('defaults a broadcast to a dry run and caps the copy at push-notification lengths', () => {
    const base = { title: 'Constella', body: 'Нова подія', reason: 'Product announcement' };
    assert.deepEqual(pushBroadcastSchema.parse({ ...base }), {
      ...base, audience: 'active', days: 7, dryRun: true,
    });
    assert.equal(pushBroadcastSchema.safeParse({ ...base, audience: 'premium' }).success, false);
    assert.equal(pushBroadcastSchema.safeParse({ ...base, dryRun: false }).success, true);
    assert.equal(pushBroadcastSchema.safeParse({ ...base, title: 'ab' }).success, false);
    assert.equal(pushBroadcastSchema.safeParse({ ...base, title: 'x'.repeat(49) }).success, false);
    assert.equal(pushBroadcastSchema.safeParse({ ...base, body: 'x'.repeat(241) }).success, false);
    assert.equal(pushBroadcastSchema.safeParse({ ...base, reason: 'oops', dryRun: false }).success, false);
    assert.equal(pushBroadcastSchema.safeParse({ ...base, reason: 'x'.repeat(501) }).success, false);
  });

  it('asks for a reason only of the send that actually writes', () => {
    const preview = { title: 'Constella', body: 'Нова подія' };
    assert.deepEqual(pushBroadcastSchema.parse(preview), {
      ...preview, audience: 'active', days: 7, reason: '', dryRun: true,
    });
    const verdict = pushBroadcastSchema.safeParse({ ...preview, dryRun: false });
    assert.equal(verdict.success, false);
    assert.equal(verdict.error.issues[0].path.join('.'), 'reason');
    assert.equal(pushBroadcastSchema.safeParse({ ...preview, dryRun: false, reason: '  Оновлення застосунку  ' }).success, true);
  });

  it('bounds the audience window the recipient preview and the send share', () => {
    assert.deepEqual(pushAudienceSchema.parse({}), { audience: 'active', days: 7 });
    assert.equal(pushAudienceSchema.safeParse({ audience: 'vip', days: 90 }).success, true);
    assert.equal(pushAudienceSchema.safeParse({ days: 91 }).success, false);
  });
});

describe('admin profile patch schema', () => {
  it('accepts a partial edit of the whitelisted fields only', () => {
    assert.deepEqual(profilePatchSchema.parse({ bio: '  Rewritten by support  ' }), { bio: 'Rewritten by support' });
    assert.deepEqual(profilePatchSchema.parse({ displayName: 'Оля', city: 'Львів' }), { displayName: 'Оля', city: 'Львів' });
  });

  it('refuses an empty patch and any state-machine field', () => {
    assert.equal(profilePatchSchema.safeParse({}).success, false);
    assert.equal(profilePatchSchema.safeParse({ photos: [] }).success, false);
    assert.equal(profilePatchSchema.safeParse({ httpStatus: 'active' }).success, false);
  });

  it('keeps photos on https and the profile above 18', () => {
    assert.equal(profilePatchSchema.safeParse({ photos: ['http://cdn.example/a.jpg'] }).success, false);
    assert.equal(profilePatchSchema.safeParse({ photos: ['https://cdn.example/a.jpg'] }).success, true);
    assert.equal(profilePatchSchema.safeParse({ birthdate: '2015-01-01' }).success, false);
    assert.equal(profilePatchSchema.safeParse({ birthdate: '2001-09-24' }).success, true);
    assert.equal(profilePatchSchema.safeParse({ birthdate: '2001-02-30' }).success, false);
  });
});
