import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { ablyChannelName, createMatchTokenRequest, isAblyConfigured, publishToMatch } from './ably.js';

const KEY = 'testapp.testkey:0123456789abcdef';
const BASIC = `Basic ${Buffer.from(KEY).toString('base64')}`;

const originalKey = process.env.ABLY_API_KEY;
const originalEnvironment = process.env.ABLY_ENVIRONMENT;
const originalFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ABLY_API_KEY;
  else process.env.ABLY_API_KEY = originalKey;
  if (originalEnvironment === undefined) delete process.env.ABLY_ENVIRONMENT;
  else process.env.ABLY_ENVIRONMENT = originalEnvironment;
});

/** Recorded `fetch` calls, so a test can assert on path, auth header and payload. */
type Call = { url: string; init: any };

const stubFetch = (response: () => Response | Promise<Response>): Call[] => {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return response();
  }) as typeof fetch;
  return calls;
};

describe('Ably fan-out', () => {
  beforeEach(() => {
    delete process.env.ABLY_ENVIRONMENT;
  });

  it('accepts only a well-formed appId.keyId:secret key', () => {
    delete process.env.ABLY_API_KEY;
    assert.equal(isAblyConfigured(), false);
    process.env.ABLY_API_KEY = 'nonsense';
    assert.equal(isAblyConfigured(), false);
    process.env.ABLY_API_KEY = 'testapp.testkey:';
    assert.equal(isAblyConfigured(), false);
    process.env.ABLY_API_KEY = 'testapptestkey:0123456789';
    assert.equal(isAblyConfigured(), false);
    process.env.ABLY_API_KEY = KEY;
    assert.equal(isAblyConfigured(), true);
  });

  it('publishes nothing while Ably is unconfigured', async () => {
    delete process.env.ABLY_API_KEY;
    const calls = stubFetch(() => new Response('{}', { status: 200 }));
    assert.equal(await publishToMatch('match-1', { type: 'chat.message', actorId: null }), false);
    assert.deepEqual(calls, []);
  });

  it('publishes the envelope under the match channel with Basic auth', async () => {
    process.env.ABLY_API_KEY = KEY;
    const calls = stubFetch(() => new Response('{}', { status: 201 }));
    const ok = await publishToMatch('550e8400-e29b-41d4-a716-446655440000', {
      type: 'call.incoming',
      matchId: '550e8400-e29b-41d4-a716-446655440000',
      fromId: 'user-1',
      actorId: 'user-1',
    });

    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      'https://rest.ably.io/channels/match%3A550e8400-e29b-41d4-a716-446655440000/messages',
    );
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.authorization, BASIC);
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      name: 'call.incoming',
      data: {
        type: 'call.incoming',
        matchId: '550e8400-e29b-41d4-a716-446655440000',
        fromId: 'user-1',
        actorId: 'user-1',
      },
    });
  });

  it('targets the sandbox host when asked to', async () => {
    process.env.ABLY_API_KEY = KEY;
    process.env.ABLY_ENVIRONMENT = 'sandbox';
    const calls = stubFetch(() => new Response('{}', { status: 201 }));
    await publishToMatch('match-2', { type: 'chat.typing' });
    assert.ok(calls[0].url.startsWith('https://sandbox-rest.ably.io/channels/'));
  });

  it('swallows a rejected or unreachable Ably instead of failing the mutation', async () => {
    process.env.ABLY_API_KEY = KEY;
    stubFetch(() => new Response('{"error":1}', { status: 500 }));
    assert.equal(await publishToMatch('match-3', { type: 'chat.message' }), false);

    stubFetch(
      () =>
        new Promise<Response>((_, reject) => {
          reject(new Error('timed out'));
        }),
    );
    assert.equal(await publishToMatch('match-3', { type: 'chat.message' }), false);
  });

  it('mints a subscribe-only token for exactly one channel', async () => {
    process.env.ABLY_API_KEY = KEY;
    // TokenRequests are signed locally — no Ably round-trip to assert on here.
    const request = await createMatchTokenRequest('match-4', 'user-9');
    assert.equal(request.clientId, 'user-9');
    assert.equal(request.keyName, 'testapp.testkey');
    assert.equal(request.ttl, 3_600_000);
    assert.deepEqual(JSON.parse(String(request.capability)), { [ablyChannelName('match-4')]: ['subscribe'] });
    assert.ok(request.mac && request.nonce && request.timestamp);
  });

  it('refuses to sign a token without a usable key', async () => {
    delete process.env.ABLY_API_KEY;
    await assert.rejects(() => createMatchTokenRequest('match-5', 'user-1'), /ABLY_API_KEY/);
    process.env.ABLY_API_KEY = 'broken';
    await assert.rejects(() => createMatchTokenRequest('match-5', 'user-1'), /malformed/);
  });
});
