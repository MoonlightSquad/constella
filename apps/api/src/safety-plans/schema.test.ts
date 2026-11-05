import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/constella';
const { safetyPlanFields } = await import('./router.js');

const future = () => new Date(Date.now() + 60 * 60_000).toISOString();

describe('safety plan input', () => {
  const base = () => ({
    matchId: '7c1a2b34-5d6e-4f70-8a91-b2c3d4e5f607',
    startsAt: future(),
    venueName: 'Central cafe',
    city: 'Kyiv',
  });

  it('accepts a future public venue name and city', () => {
    assert.equal(safetyPlanFields.safeParse(base()).success, true);
  });

  it('rejects contact details and URLs in the venue and city', () => {
    assert.equal(safetyPlanFields.safeParse({ ...base(), venueName: 'https://example.com' }).success, false);
    assert.equal(safetyPlanFields.safeParse({ ...base(), city: 'call +380 50 123 4567' }).success, false);
  });

  it('rejects a past date and a date too far in the future', () => {
    assert.equal(safetyPlanFields.safeParse({ ...base(), startsAt: new Date(Date.now() - 60_000).toISOString() }).success, false);
    assert.equal(safetyPlanFields.safeParse({ ...base(), startsAt: new Date(Date.now() + 366 * 24 * 60 * 60_000).toISOString() }).success, false);
  });
});
