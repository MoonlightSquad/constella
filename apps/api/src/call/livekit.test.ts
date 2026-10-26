import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { callUrl, createCallToken, isCallProviderConfigured, newCallRoomId } from './livekit.js';

const originalKey = process.env.LIVEKIT_API_KEY;
const originalSecret = process.env.LIVEKIT_API_SECRET;
const originalUrl = process.env.LIVEKIT_URL;

const restore = () => {
  for (const [name, value] of [
    ['LIVEKIT_API_KEY', originalKey],
    ['LIVEKIT_API_SECRET', originalSecret],
    ['LIVEKIT_URL', originalUrl],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
};

after(restore);

const configure = () => {
  process.env.LIVEKIT_API_KEY = 'APsc_testkey';
  process.env.LIVEKIT_API_SECRET = 'a'.repeat(32);
  process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
};

const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

describe('LiveKit call configuration', () => {
  it('reports unavailable while any credential is missing', () => {
    delete process.env.LIVEKIT_API_KEY;
    configure();
    delete process.env.LIVEKIT_URL;
    assert.equal(isCallProviderConfigured(), false);
  });

  it('reports available once key, secret and url are all set', () => {
    configure();
    assert.equal(isCallProviderConfigured(), true);
    assert.equal(callUrl(), 'wss://test.livekit.cloud');
  });

  it('refuses to hand the browser an empty endpoint', () => {
    restore();
    assert.throws(() => callUrl(), /LIVEKIT_URL/);
  });
});

describe('LiveKit call tokens', () => {
  it('scopes the token to its own room and identity', async () => {
    configure();
    const jwt = await createCallToken({ room: 'constella-call-1', identity: 'user-1', name: 'Оля' });
    const payload = claims(jwt);
    assert.equal(payload.video.room, 'constella-call-1');
    assert.equal(payload.video.roomJoin, true);
    assert.equal(payload.video.roomCreate, true);
    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.name, 'Оля');
  });

  it('does not sign without credentials', async () => {
    restore();
    await assert.rejects(() => createCallToken({ room: 'r', identity: 'u' }), /not configured/i);
  });
});

describe('call room ids', () => {
  it('separates two dials inside the same match', () => {
    const matchId = '2f0d4d2f-6b3b-4a1e-9d3f-3f8a1c0b7f11';
    const first = newCallRoomId(matchId);
    const second = newCallRoomId(matchId);
    assert.ok(first.startsWith(`constella-call-${matchId}-`));
    assert.notEqual(first, second);
  });
});
