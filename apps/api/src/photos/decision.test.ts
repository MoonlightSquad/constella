import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_NSFW_THRESHOLDS,
  decideNsfw,
  explicitScore,
  parseNsfwScores,
  type NsfwScores,
} from './decision.js';

const vector = (over: Partial<NsfwScores> = {}): NsfwScores => ({
  drawings: 0.02,
  neutral: 0.9,
  sexy: 0.02,
  porn: 0.05,
  hentai: 0.01,
  ...over,
});

describe('NSFW decision thresholds', () => {
  it('approves a clean photo', () => {
    assert.equal(decideNsfw(vector()).outcome, 'approved');
  });

  it('rejects at exactly the reject floor', () => {
    const scores = vector({ porn: 0.8, hentai: 0, neutral: 0.2 });
    assert.equal(explicitScore(scores), DEFAULT_NSFW_THRESHOLDS.rejectAt);
    assert.equal(decideNsfw(scores).outcome, 'rejected');
  });

  it('holds just below the reject floor for human review', () => {
    const scores = vector({ porn: 0.79, hentai: 0, neutral: 0.21 });
    assert.equal(decideNsfw(scores).outcome, 'pending');
  });

  it('holds at exactly the pending floor', () => {
    const scores = vector({ porn: 0.15, hentai: 0, neutral: 0.8 });
    assert.equal(decideNsfw(scores).outcome, 'pending');
  });

  it('just below the pending floor and no sexy signal is approved', () => {
    const scores = vector({ porn: 0.149, hentai: 0, neutral: 0.851, sexy: 0.01 });
    assert.equal(decideNsfw(scores).outcome, 'approved');
  });

  it('splits hentai and porn into one explicit score', () => {
    const scores = vector({ porn: 0.4, hentai: 0.4, neutral: 0.2 });
    assert.equal(explicitScore(scores), 0.8);
    assert.equal(decideNsfw(scores).outcome, 'rejected');
  });

  it('reviews a swimwear-style photo on the sexy class alone', () => {
    const scores = vector({ sexy: 0.35, porn: 0, hentai: 0, neutral: 0.6 });
    assert.equal(decideNsfw(scores).outcome, 'pending');
  });

  it('never auto-rejects on the sexy class alone', () => {
    const scores = vector({ sexy: 0.95, porn: 0.02, hentai: 0, neutral: 0.03 });
    assert.equal(decideNsfw(scores).outcome, 'pending');
  });

  it('persists the explicit score, not the winning class probability', () => {
    const scores = vector({ porn: 0.3, hentai: 0.2, neutral: 0.5 });
    assert.equal(decideNsfw(scores).score, 0.5);
  });

  it('honours injected thresholds so tests pin the table', () => {
    const scores = vector({ porn: 0.5, hentai: 0, neutral: 0.5 });
    assert.equal(decideNsfw(scores, { rejectAt: 0.4, pendingAt: 0.1, sexyReviewAt: 0.9 }).outcome, 'rejected');
    assert.equal(decideNsfw(scores, { rejectAt: 0.9, pendingAt: 0.6, sexyReviewAt: 0.9 }).outcome, 'approved');
  });
});

describe('NSFW response validation', () => {
  it('accepts a complete probability vector', () => {
    assert.deepEqual(parseNsfwScores(vector()), vector());
  });

  it('accepts a vector that only sums to ~1 within tolerance', () => {
    const scores = parseNsfwScores(vector({ neutral: 0.94 }));
    assert.ok(scores);
  });

  it('rejects a vector that does not sum to one', () => {
    assert.equal(parseNsfwScores({ drawings: 0.1, neutral: 0.1, sexy: 0.1, porn: 0.1, hentai: 0.1 }), null);
  });

  it('rejects a missing class', () => {
    const { hentai: _hentai, ...rest } = vector();
    assert.equal(parseNsfwScores(rest), null);
  });

  it('rejects out-of-range and non-finite probabilities', () => {
    assert.equal(parseNsfwScores(vector({ porn: 1.5 })), null);
    assert.equal(parseNsfwScores(vector({ porn: -0.1 })), null);
    assert.equal(parseNsfwScores(vector({ porn: Number.NaN })), null);
    assert.equal(parseNsfwScores(vector({ porn: '0.5' as any })), null);
  });

  it('rejects non-object payloads', () => {
    for (const value of [null, undefined, 'porn', 42, []]) {
      assert.equal(parseNsfwScores(value), null);
    }
  });
});
