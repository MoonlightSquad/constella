import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NSFW_PROVIDER,
  UNAVAILABLE_PROVIDER,
  UNMODERATED_PROVIDER,
  moderatePhoto,
  readThresholds,
} from './moderation.js';

const token = 'a'.repeat(32);
const bytes = new Uint8Array([1, 2, 3]);
const configuredEnv = { AI_SERVICE_URL: 'https://ai.example.com', AI_INTERNAL_TOKEN: token };

const served = (scores: Record<string, unknown>) =>
  (async () => ({ ok: true, status: 200, json: async () => ({ scores }) })) as unknown as typeof fetch;

// Вектори з двійково-точними частками: сума класів рівно 1, а porn+hentai — рівно
// очікувана скора, тож тести порівнюють числа без ігнорування float-шуму.
const clean = { drawings: 0.25, neutral: 0.5, sexy: 0.125, porn: 0.0625, hentai: 0.0625 };
const swimwear = { drawings: 0.125, neutral: 0.5, sexy: 0.375, porn: 0, hentai: 0 };
const moderate = { drawings: 0, neutral: 0.5, sexy: 0.125, porn: 0.25, hentai: 0.125 };
const explicit = { drawings: 0, neutral: 0.125, sexy: 0.0625, porn: 0.5, hentai: 0.3125 };

describe('photo moderation orchestrator', () => {
  it("keeps today's behaviour when the service is not configured", async () => {
    let calls = 0;
    const spyFetch = (async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ scores: clean }) } as never;
    }) as unknown as typeof fetch;

    for (const env of [{}, { AI_SERVICE_URL: '   ' }, { AI_SERVICE_URL: '' }]) {
      assert.deepEqual(await moderatePhoto(bytes, { env, fetchImpl: spyFetch }), {
        status: 'approved', score: null, provider: UNMODERATED_PROVIDER,
      });
    }
    assert.equal(calls, 0, 'a disabled flag must not touch the network');
  });

  it('holds instead of approving when no token is configured', async () => {
    const result = await moderatePhoto(bytes, { env: { AI_SERVICE_URL: 'https://ai.example.com' }, fetchImpl: served(clean) });
    assert.deepEqual(result, { status: 'pending', score: null, provider: UNAVAILABLE_PROVIDER });
  });

  it('approves, holds and rejects on the default thresholds', async () => {
    const approved = await moderatePhoto(bytes, { env: configuredEnv, fetchImpl: served(clean) });
    assert.deepEqual(approved, { status: 'approved', score: 0.125, provider: NSFW_PROVIDER });

    const held = await moderatePhoto(bytes, { env: configuredEnv, fetchImpl: served(swimwear) });
    assert.equal(held.status, 'pending', 'swimwear goes to humans, never auto-reject');

    const rejected = await moderatePhoto(bytes, { env: configuredEnv, fetchImpl: served(explicit) });
    assert.deepEqual(rejected, { status: 'rejected', score: 0.8125, provider: NSFW_PROVIDER });
  });

  it('holds the photo for every transport failure instead of approving it', async () => {
    const failures = [
      (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch,
      (async () => ({ ok: false, status: 503, json: async () => ({}) }) as never) as unknown as typeof fetch,
      served({ nonsense: true }),
      served({ drawings: 0.5, neutral: 0.5, sexy: 0.5, porn: 0.5, hentai: 0.5 }),
    ];
    for (const fetchImpl of failures) {
      assert.deepEqual(await moderatePhoto(bytes, { env: configuredEnv, fetchImpl }), {
        status: 'pending', score: null, provider: UNAVAILABLE_PROVIDER,
      });
    }
  });

  it('loosens auto-rejection from env', async () => {
    const byDefault = await moderatePhoto(bytes, { env: configuredEnv, fetchImpl: served(moderate) });
    assert.equal(byDefault.status, 'pending');

    const env = { ...configuredEnv, AI_NSFW_REJECT_AT: '0.3', AI_NSFW_PENDING_AT: '0.05' };
    assert.equal((await moderatePhoto(bytes, { env, fetchImpl: served(moderate) })).status, 'rejected');
  });

  it('falls back to the known thresholds when env inverts or corrupts them', () => {
    const expected = { rejectAt: 0.8, pendingAt: 0.15, sexyReviewAt: 0.35 };
    assert.deepEqual(readThresholds({ AI_NSFW_REJECT_AT: '0.1', AI_NSFW_PENDING_AT: '0.9' }), expected);
    assert.deepEqual(readThresholds({ AI_NSFW_REJECT_AT: 'banana', AI_NSFW_PENDING_AT: '7' }), expected);
  });

  it('reads usable thresholds from env', () => {
    assert.deepEqual(
      readThresholds({ AI_NSFW_REJECT_AT: '0.3', AI_NSFW_PENDING_AT: '0.05', AI_NSFW_SEXY_REVIEW_AT: '0.5' }),
      { rejectAt: 0.3, pendingAt: 0.05, sexyReviewAt: 0.5 }
    );
  });
});
