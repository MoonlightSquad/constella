import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACHIEVEMENTS, DAILY_QUESTS, getZodiac, INTEREST_TAGS, STREAK_REWARDS } from './gamification.js';

describe('gamification catalog', () => {
  it('has unique achievement, quest, and interest codes with positive rewards', () => {
    assert.equal(new Set(ACHIEVEMENTS.map((x) => x.code)).size, ACHIEVEMENTS.length);
    assert.equal(new Set(DAILY_QUESTS.map((x) => x.code)).size, DAILY_QUESTS.length);
    assert.equal(new Set(INTEREST_TAGS).size, INTEREST_TAGS.length);
    assert.ok(ACHIEVEMENTS.every((x) => x.xp > 0));
    assert.ok(DAILY_QUESTS.every((x) => x.target > 0 && x.xp > 0));
  });
  it('defines rewards at the intended streak milestones', () => {
    assert.deepEqual(STREAK_REWARDS[3], { superlikes: 1 });
    assert.equal(STREAK_REWARDS[7]?.freezes, 1);
    assert.equal(STREAK_REWARDS[14]?.vipHours, 24);
    assert.equal(STREAK_REWARDS[30]?.vipHours, 72);
  });
  it('handles zodiac boundary dates in UTC', () => {
    assert.equal(getZodiac(new Date('2000-01-20T12:00:00Z')), 'Capricorn');
    assert.equal(getZodiac(new Date('2000-01-21T12:00:00Z')), 'Aquarius');
    assert.equal(getZodiac(new Date('2000-02-19T12:00:00Z')), 'Aquarius');
    assert.equal(getZodiac(new Date('2000-02-20T12:00:00Z')), 'Pisces');
    assert.equal(getZodiac(new Date('2000-12-31T12:00:00Z')), 'Capricorn');
  });
});
