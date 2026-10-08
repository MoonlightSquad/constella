import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ??= 'postgres://constella:test@127.0.0.1:5432/constella';
const { checkSwipeVelocityAndSpam, effectivePoint, interestScore, remainingLikes, referralCodeFor, toPublicProfile } = await import('./core.js');

describe('profile and discovery helpers', () => {
  it('detects abnormal swipe velocity bursts and throttles spam bots', async () => {
    const mockDb = {
      update: () => ({ set: () => ({ where: async () => {} }) }),
      insert: () => ({ values: async () => {} }),
    };
    const userId = 'bot-user-123';
    let isOk = true;
    for (let i = 0; i < 30; i++) {
      isOk = await checkSwipeVelocityAndSpam(mockDb, userId);
    }
    assert.equal(isOk, false);
  });
  it('scores matching interests and handles empty lists', () => {
    assert.equal(interestScore(['music', 'travel'], ['music', 'books']), 50);
    assert.equal(interestScore([], ['music']), 0);
    assert.equal(interestScore(['music'], ['music']), 100);
  });
  it('prefers complete passport coordinates and falls back to profile location', () => {
    assert.deepEqual(effectivePoint({ latitude: 50, longitude: 30, locationOverrideLat: 40, locationOverrideLng: -73 }), { lat: 40, lng: -73 });
    assert.deepEqual(effectivePoint({ latitude: 50, longitude: 30 }), { lat: 50, lng: 30 });
    assert.equal(effectivePoint({ latitude: 50, longitude: null }), null);
  });
  it('keeps private fields out of public profile output and fills safe defaults', () => {
    const publicProfile = toPublicProfile({
      id: 'user-1', birthdate: new Date('1990-01-01T12:00:00Z'), gender: 'woman',
      city: 'Kyiv', displayName: '', promptOne: 'Prompt', promptTwo: '', promptThree: null,
      email: 'private@example.test', interests: ['music'], photos: null,
    }, ['music'], 3);
    assert.equal(publicProfile.displayName, '\u041d\u043e\u0432\u0435 \u0437\u043d\u0430\u0439\u043e\u043c\u0441\u0442\u0432\u043e');
    assert.equal(publicProfile.city, 'Kyiv');
    assert.deepEqual(publicProfile.prompts, ['Prompt']);
    assert.deepEqual(publicProfile.photos, []);
    assert.equal(publicProfile.matchPercent, 100);
    assert.equal(publicProfile.distanceKm, 3);
    assert.equal('email' in publicProfile, false);
  });
  it('returns stable short referral codes', () => {
    const first = referralCodeFor('user-1');
    assert.equal(first, referralCodeFor('user-1'));
    assert.match(first, /^[a-f0-9]{8}$/);
    assert.notEqual(first, referralCodeFor('user-2'));
  });
  it('resets daily likes and exempts VIP', () => {
    assert.equal(remainingLikes({ timeZone: 'UTC', dailyLikesOn: new Date().toISOString().slice(0, 10), dailyLikesUsed: 4 }, false), 16);
    assert.equal(remainingLikes({ timeZone: 'UTC', dailyLikesOn: new Date().toISOString().slice(0, 10), dailyLikesUsed: 22 }, false), 0);
    assert.equal(remainingLikes({ timeZone: 'UTC', dailyLikesUsed: 20 }, true), Number.POSITIVE_INFINITY);
  });
});
