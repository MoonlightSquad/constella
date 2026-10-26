import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { getTableName } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://constella:test@127.0.0.1:5432/constella';

const { socialRouter } = await import('./social.js');
const { registerConnection, resetConnections } = await import('../realtime.js');

const MATCH_ID = '2f0d4d2f-6b3b-4a1e-9d3f-3f8a1c0b7f11';
const CALLER = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const ROOM = 'constella-call-room-1';

const originalEnv = {
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  LIVEKIT_URL: process.env.LIVEKIT_URL,
};

const configure = () => {
  process.env.LIVEKIT_API_KEY = 'APsc_testkey';
  process.env.LIVEKIT_API_SECRET = 'a'.repeat(32);
  process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
};

const clearConfig = () => {
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
  delete process.env.LIVEKIT_URL;
};

after(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetConnections();
});

beforeEach(() => resetConnections());

/** Мімікує drizzle-ланцюжки, якими користуються процедури дзвінка. */
const fakeDb = (tables: Record<string, any[]>, writes: any[] = []) => {
  const chain = (name: string): any => ({
    from: (table: any) => chain(getTableName(table)),
    where: () => chain(name),
    orderBy: () => chain(name),
    limit: () => chain(name),
    then: (onfulfilled: any, onrejected: any) => Promise.resolve(tables[name] ?? []).then(onfulfilled, onrejected),
  });
  return {
    select: () => chain(''),
    insert: (table: any) => ({
      values: (row: any) => {
        writes.push({ table: getTableName(table), row, body: row.body });
        return Promise.resolve();
      },
    }),
    update: (table: any) => ({
      set: (patch: any) => ({
        where: () => {
          writes.push({ table: getTableName(table), patch });
          return Promise.resolve();
        },
      }),
    }),
  } as any;
};

/** Сокет піра в реальному реєстрі `realtime.ts` — щоб бачити, що саме сервер розсилає. */
const capture = (userId: string) => {
  const events: any[] = [];
  registerConnection({
    userId,
    matchId: MATCH_ID,
    conn: { readyState: 1, send: (raw: string) => { events.push(JSON.parse(raw)); }, close: () => {}, on: () => {} },
  });
  return events;
};

const baseTables = (callRows: any[] = []) => ({
  matches: [{ id: MATCH_ID, userOneId: CALLER, userTwoId: PEER }],
  blockedUsers: [],
  // Той самий рядок слугує і `isAuthed` (bannedAt/sessionVersion), і пошуку displayName.
  users: [{ bannedAt: null, sessionVersion: 1, displayName: 'Оля' }],
  messages: callRows,
});

const callerOf = (userId: string, db: any) =>
  socialRouter.createCaller({ req: {} as any, res: {} as any, user: { id: userId, telegramId: null, sessionVersion: 1 }, db });

const ringingRow = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  senderId: CALLER,
  createdAt: new Date(),
  body: JSON.stringify({ callType: 'audio', roomId: ROOM, status: 'ringing', ...overrides }),
});

const readBody = (write: any) => JSON.parse(write.table === 'messages' ? (write.body ?? write.patch?.body) : '{}');

describe('social.startCall', () => {
  it('refuses to dial while the provider is not configured', async () => {
    clearConfig();
    const db = fakeDb(baseTables());
    await assert.rejects(() => callerOf(CALLER, db).startCall({ matchId: MATCH_ID, callType: 'audio' }), {
      code: 'PRECONDITION_FAILED',
    });
  });

  it('returns a scoped token and rings the peer without leaking it', async () => {
    configure();
    const writes: any[] = [];
    const db = fakeDb(baseTables(), writes);
    const peerEvents = capture(PEER);

    const result = await callerOf(CALLER, db).startCall({ matchId: MATCH_ID, callType: 'video' });

    assert.match(result.url, /livekit\.cloud$/);
    assert.equal(result.token.split('.').length, 3);
    assert.ok(result.roomId.startsWith(`constella-call-${MATCH_ID}-`));
    assert.equal(readBody(writes[0]).status, 'ringing');
    assert.equal(peerEvents[0].type, 'call.incoming');
    assert.equal(peerEvents[0].callType, 'video');
    // Каліфер дістає власний токен через acceptCall, а не чужий із шиноподібної події.
    assert.equal(peerEvents[0].token, undefined);
  });

  it('rejects a second dial while one is still ringing', async () => {
    configure();
    const db = fakeDb(baseTables([ringingRow()]));
    await assert.rejects(() => callerOf(CALLER, db).startCall({ matchId: MATCH_ID, callType: 'audio' }), {
      code: 'CONFLICT',
    });
  });

  it('clears a ringing row whose caller vanished', async () => {
    configure();
    const stale = ringingRow({ createdAt: undefined, status: 'ringing' });
    stale.createdAt = new Date(Date.now() - 60_000);
    const writes: any[] = [];
    const db = fakeDb(baseTables([stale]), writes);

    await callerOf(PEER, db).startCall({ matchId: MATCH_ID, callType: 'audio' });

    assert.equal(readBody(writes[0]).status, 'missed');
    assert.equal(readBody(writes[1]).status, 'ringing');
  });
});

describe('social.acceptCall', () => {
  it('will not let the caller accept their own call', async () => {
    configure();
    const db = fakeDb(baseTables([ringingRow()]));
    await assert.rejects(() => callerOf(CALLER, db).acceptCall({ matchId: MATCH_ID, roomId: ROOM }), {
      code: 'FORBIDDEN',
    });
  });

  it('reports a room the peer never rang into', async () => {
    configure();
    const db = fakeDb(baseTables([ringingRow()]));
    await assert.rejects(() => callerOf(PEER, db).acceptCall({ matchId: MATCH_ID, roomId: 'other-room' }), {
      code: 'NOT_FOUND',
    });
  });

  it('refuses a call that already stopped ringing', async () => {
    configure();
    const db = fakeDb(baseTables([ringingRow({ status: 'accepted' })]));
    await assert.rejects(() => callerOf(PEER, db).acceptCall({ matchId: MATCH_ID, roomId: ROOM }), {
      code: 'CONFLICT',
    });
  });

  it('mints the peer its own token and tells the caller', async () => {
    configure();
    const writes: any[] = [];
    const db = fakeDb(baseTables([ringingRow({ callType: 'video' })]), writes);
    const callerEvents = capture(CALLER);

    const result = await callerOf(PEER, db).acceptCall({ matchId: MATCH_ID, roomId: ROOM });

    assert.equal(result.callType, 'video');
    assert.equal(readBody(writes[0]).status, 'accepted');
    assert.ok(readBody(writes[0]).acceptedAt);
    assert.equal(callerEvents[0].type, 'call.accepted');
    assert.equal(callerEvents[0].token, undefined);
    const claims = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString('utf8'));
    assert.equal(claims.sub, PEER);
    assert.equal(claims.video.room, ROOM);
  });
});

describe('social.rejectCall', () => {
  it('marks the call rejected and notifies the caller', async () => {
    configure();
    const writes: any[] = [];
    const db = fakeDb(baseTables([ringingRow()]), writes);
    const callerEvents = capture(CALLER);

    const result = await callerOf(PEER, db).rejectCall({ matchId: MATCH_ID, roomId: ROOM });

    assert.equal(result.ok, true);
    assert.equal(readBody(writes[0]).status, 'rejected');
    assert.equal(callerEvents[0].type, 'call.rejected');
  });

  it('is a no-op on a call nobody is ringing anymore', async () => {
    configure();
    const writes: any[] = [];
    const db = fakeDb(baseTables([ringingRow({ status: 'ended' })]), writes);
    assert.equal((await callerOf(PEER, db).rejectCall({ matchId: MATCH_ID, roomId: ROOM })).ok, false);
    assert.equal(writes.length, 0);
  });
});

describe('social.endCall', () => {
  const acceptedRow = () => ({
    id: 9,
    senderId: CALLER,
    createdAt: new Date(),
    body: JSON.stringify({
      callType: 'audio',
      roomId: ROOM,
      status: 'accepted',
      acceptedAt: new Date(Date.now() - 42_000).toISOString(),
    }),
  });

  it('stores the duration and tells both sockets', async () => {
    configure();
    const row = acceptedRow();
    const writes: any[] = [];
    const db = fakeDb(baseTables([row]), writes);
    const callerEvents = capture(CALLER);
    const peerEvents = capture(PEER);

    const result = await callerOf(CALLER, db).endCall({ matchId: MATCH_ID, roomId: ROOM, reason: 'ended' });

    assert.ok(result.durationSec >= 40 && result.durationSec <= 43);
    assert.equal(readBody(writes[0]).status, 'ended');
    // Завершення летить обом, інакше пір зависне на «активному» дзвінку.
    assert.equal(callerEvents[0].type, 'call.ended');
    assert.equal(peerEvents[0].type, 'call.ended');
    assert.equal(peerEvents[0].durationSec, result.durationSec);
  });

  it('counts a hang-up before the answer as missed with zero duration', async () => {
    configure();
    const writes: any[] = [];
    const db = fakeDb(baseTables([ringingRow()]), writes);

    const result = await callerOf(CALLER, db).endCall({ matchId: MATCH_ID, roomId: ROOM, reason: 'missed' });

    assert.equal(result.durationSec, 0);
    assert.equal(readBody(writes[0]).status, 'missed');
  });

  it('keeps the first duration when both peers hang up', async () => {
    configure();
    const row = acceptedRow();
    const writes: any[] = [];
    const db = fakeDb(baseTables([row]), writes);

    const first = await callerOf(CALLER, db).endCall({ matchId: MATCH_ID, roomId: ROOM, reason: 'ended' });
    row.body = writes[0].patch.body;
    const second = await callerOf(PEER, db).endCall({ matchId: MATCH_ID, roomId: ROOM, reason: 'ended' });

    assert.equal(writes.length, 1);
    assert.equal(second.durationSec, first.durationSec);
  });
});

describe('social.callConfig', () => {
  it('hides calls from the client until the provider is configured', async () => {
    clearConfig();
    const config = await callerOf(CALLER, fakeDb(baseTables())).callConfig();
    assert.equal(config.available, false);
    assert.equal(config.url, '');
  });

  it('publishes the endpoint the browser must dial', async () => {
    configure();
    const config = await callerOf(CALLER, fakeDb(baseTables())).callConfig();
    assert.equal(config.available, true);
    assert.equal(config.url, 'wss://test.livekit.cloud');
  });
});
