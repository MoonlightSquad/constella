import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyImage } from './ai-client.js';

const scores = { drawings: 0.02, neutral: 0.9, sexy: 0.02, porn: 0.05, hentai: 0.01 };
const token = 'a'.repeat(32);
const config = (over: Record<string, unknown> = {}) => ({ serviceUrl: 'https://ai.example.com', token, ...over });

const responding = (reply: { ok?: boolean; status?: number; body?: unknown; throwsJson?: boolean }) =>
  async (_url: unknown, init?: { headers?: Record<string, string>; body?: unknown }) => {
    captured.push(init);
    if (reply.ok === false) return { ok: false, status: reply.status ?? 503, json: async () => ({}) } as never;
    return {
      ok: true,
      status: 200,
      json: reply.throwsJson ? async () => { throw new SyntaxError('bad json'); } : async () => reply.body,
    } as never;
  };

let captured: any[] = [];

describe('AI classify client', () => {
  it('refuses to call out without a configured url or a usable token', async () => {
    for (const bad of [config({ serviceUrl: '' }), config({ token: '' }), config({ token: 'short' })]) {
      const result = await classifyImage(new Uint8Array([1]), bad as any);
      assert.deepEqual(result, { ok: false, reason: 'not_configured' });
    }
  });

  it('posts the bytes with the internal token to the classify path', async () => {
    captured = [];
    const result = await classifyImage(new Uint8Array([1, 2, 3]), {
      ...config(),
      fetchImpl: responding({ body: { scores } }) as any,
    } as any);
    assert.equal(result.ok, true);
    assert.deepEqual(captured[0].headers, { 'x-ai-token': token, 'content-type': 'image/webp' });
    assert.equal(captured[0].body instanceof Uint8Array, true);
    assert.ok(captured[0].signal, 'a timeout signal must always be attached');
  });

  it('tolerates a trailing slash in the service url', async () => {
    captured = [];
    await classifyImage(new Uint8Array([1]), {
      ...config({ serviceUrl: 'https://ai.example.com//' }),
      fetchImpl: async (url: unknown) => {
        captured.push(url);
        return { ok: true, status: 200, json: async () => ({ scores }) } as never;
      },
    } as any);
    assert.equal(captured[0], 'https://ai.example.com/v1/classify-image');
  });

  it('maps a non-2xx response to unavailable', async () => {
    const result = await classifyImage(new Uint8Array([1]), {
      ...config(),
      fetchImpl: responding({ ok: false, status: 503 }) as any,
    } as any);
    assert.deepEqual(result, { ok: false, reason: 'unavailable' });
  });

  it('maps a thrown network error to unavailable', async () => {
    const result = await classifyImage(new Uint8Array([1]), {
      ...config(),
      fetchImpl: async () => { throw new TypeError('fetch failed'); },
    } as any);
    assert.deepEqual(result, { ok: false, reason: 'unavailable' });
  });

  it('maps an aborted request to timeout', async () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      const error = new Error(name);
      error.name = name;
      const result = await classifyImage(new Uint8Array([1]), {
        ...config(),
        fetchImpl: async () => { throw error; },
      } as any);
      assert.deepEqual(result, { ok: false, reason: 'timeout' }, name);
    }
  });

  it('maps an unparseable or malformed body to bad_response', async () => {
    for (const body of [undefined, null, {}, { scores: null }, { scores: { porn: 1 } }, 'not json']) {
      const result = await classifyImage(new Uint8Array([1]), {
        ...config(),
        fetchImpl: responding({ body }) as any,
      } as any);
      assert.deepEqual(result, { ok: false, reason: 'bad_response' }, JSON.stringify(body));
    }
  });

  it('maps a response that throws during json parsing to bad_response', async () => {
    const result = await classifyImage(new Uint8Array([1]), {
      ...config(),
      fetchImpl: responding({ throwsJson: true }) as any,
    } as any);
    assert.deepEqual(result, { ok: false, reason: 'bad_response' });
  });
});
