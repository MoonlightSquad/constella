import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { getTableName } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://constella:test@127.0.0.1:5432/constella';

const { socialRouter } = await import('./social.js');
const { registerConnection, resetConnections } = await import('../realtime.js');

const MATCH_ID = '7c1a2b34-5d6e-4f70-8a91-b2c3d4e5f607';
const SENDER = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const KEY = 'testapp.testkey:0123456789abcdef';

const originalKey = process.env.ABLY_API_KEY;
const originalFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ABLY_API_KEY;
  else process.env.ABLY_API_KEY = originalKey;
  resetConnections();
});

beforeEach(() => {
  resetConnections();
  delete process.env.ABLY_API_KEY;
  // Nothing in these tests should reach Ably; a stray publish is recorded instead.
  const published: { url: string; body: any }[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    published.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('{}', { status: 201 });
  }) as typeof fetch;
  (globalThis as any).__published = published;
});

const published = () => (globalThis as any).__published as { url: string; body: any }[];

/** Мімікує drizzle-ланцюжки `select/insert/update…returning`, якими користуються ці процедури. */
const fakeDb = (tables: Record<string, any[]>, writes: any[] = [], readRows: any[] = []) => {
  const chain = (name: string): any => ({
    from: (table: any) => chain(getTableName(table)),
    where: (condition: any) => {
      writes.push({ table: name, condition });
      return chain(name);
    },
    orderBy: () => chain(name),
    limit: () => chain(name),
    then: (onfulfilled: any, onrejected: any) => Promise.resolve(tables[name] ?? []).then(onfulfilled, onrejected),
  });
  return {
    select: () => chain(''),
    insert: (table: any) => ({
      values: (row: any) => {
        writes.push({ table: getTableName(table), row });
        return Promise.resolve();
      },
    }),
    update: (table: any) => ({
      set: (patch: any) => ({
        where: (condition: any) => {
          // Без сесії dialect недоступний, тож рендеримо SQL вручну — достатньо,
          // щоб перевірити, якими саме умовами процедуру обмежено.
          const query = condition.toQuery({
            escapeName: (name: string) => `"${name}"`,
            escapeParam: (index: number) => `$${index + 1}`,
            inlineParams: false,
          });
          writes.push({ table: getTableName(table), patch, sql: query.sql as string, params: query.params as unknown[] });
          return { returning: async () => readRows };
        },
      }),
    }),
  } as any;
};

const baseTables = (overrides: Record<string, any[]> = {}) => ({
  matches: [{ id: MATCH_ID, userOneId: SENDER, userTwoId: PEER }],
  blockedUsers: [],
  users: [{ bannedAt: null, sessionVersion: 1, displayName: 'Оля' }],
  messages: [],
  ...overrides,
});

const callerOf = (userId: string, db: any) =>
  socialRouter.createCaller({ req: {} as any, res: {} as any, user: { id: userId, telegramId: null, sessionVersion: 1 }, db });

/** Сокети піра (і автора) в реальному реєстрі — щоб бачити, що саме сервер розсилає. */
const capture = (userId: string) => {
  const events: any[] = [];
  registerConnection({
    userId,
    matchId: MATCH_ID,
    conn: { readyState: 1, send: (raw: string) => { events.push(JSON.parse(raw)); }, close: () => {}, on: () => {} },
  });
  return events;
};

describe('social.realtimeConfig', () => {
  it('tells the browser to poll until Ably is configured', async () => {
    const config = await callerOf(SENDER, fakeDb(baseTables())).realtimeConfig();
    assert.equal(config.transport, 'poll');
  });

  it('switches to Ably once a usable key exists', async () => {
    process.env.ABLY_API_KEY = KEY;
    const config = await callerOf(SENDER, fakeDb(baseTables())).realtimeConfig();
    assert.equal(config.transport, 'ably');
  });
});

describe('social.chatToken', () => {
  it('refuses to mint a token when the transport is polling', async () => {
    await assert.rejects(() => callerOf(SENDER, fakeDb(baseTables())).chatToken({ matchId: MATCH_ID }), {
      code: 'PRECONDITION_FAILED',
    });
  });

  it('refuses a match the caller is not part of', async () => {
    process.env.ABLY_API_KEY = KEY;
    const db = fakeDb(baseTables({ matches: [] }));
    await assert.rejects(() => callerOf(SENDER, db).chatToken({ matchId: MATCH_ID }), { code: 'NOT_FOUND' });
    assert.equal(published().length, 0);
  });

  it('scopes the token to one channel, subscribe only', async () => {
    process.env.ABLY_API_KEY = KEY;
    const token = await callerOf(PEER, fakeDb(baseTables())).chatToken({ matchId: MATCH_ID });

    assert.equal(token.clientId, PEER);
    assert.deepEqual(JSON.parse(String(token.capability)), { [`match:${MATCH_ID}`]: ['subscribe'] });
    // Ключ аплікації не повинен їхати в браузер навіть у складі `keyName`.
    assert.equal(token.keyName, 'testapp.testkey');
    assert.equal(JSON.stringify(token).includes('0123456789abcdef'), false);
  });
});

describe('social.markRead', () => {
  it('acknowledges only the peer messages that are still unread', async () => {
    const writes: any[] = [];
    const db = fakeDb(baseTables(), writes, [{ id: 41, readAt: new Date() }, { id: 42, readAt: new Date() }]);
    const result = await callerOf(PEER, db).markRead({ matchId: MATCH_ID, messageIds: [41, 42] });

    assert.equal(result.marked, 2);
    const update = writes.find((write) => write.table === 'messages');
    assert.match(update.sql, /"sender_id" <>/);
    assert.match(update.sql, /"read_at" is null/i);
    assert.ok(update.params.includes(PEER));
    assert.ok(update.params.includes(41) && update.params.includes(42));
  });

  it('announces one batched receipt instead of one frame per message', async () => {
    const readAt = new Date();
    const db = fakeDb(baseTables(), [], [
      { id: 41, readAt },
      { id: 42, readAt },
      { id: 43, readAt },
    ]);
    const peerEvents = capture(PEER);

    await callerOf(SENDER, db).markRead({ matchId: MATCH_ID, messageIds: [41, 42, 43] });

    assert.equal(peerEvents.length, 1);
    assert.equal(peerEvents[0].type, 'presence.read');
    assert.deepEqual(peerEvents[0].messageIds, [41, 42, 43]);
    // Старий формат лишається: випущені збірки мобілки читують саме `messageId`.
    assert.equal(peerEvents[0].messageId, 41);
    assert.equal(new Date(peerEvents[0].readAt).getTime(), readAt.getTime());
  });

  it('says nothing when there was nothing to acknowledge', async () => {
    const db = fakeDb(baseTables(), [], []);
    const peerEvents = capture(PEER);
    assert.equal((await callerOf(SENDER, db).markRead({ matchId: MATCH_ID, messageIds: [7] })).marked, 0);
    assert.deepEqual(peerEvents, []);
  });

  it('publishes the same receipt to the Ably channel when configured', async () => {
    process.env.ABLY_API_KEY = KEY;
    const db = fakeDb(baseTables(), [], [{ id: 41, readAt: new Date() }]);
    await callerOf(SENDER, db).markRead({ matchId: MATCH_ID, messageIds: [41] });

    assert.equal(published().length, 1);
    assert.equal(published()[0].url, `https://rest.ably.io/channels/match%3A${MATCH_ID}/messages`);
    assert.equal(published()[0].body.name, 'presence.read');
    assert.deepEqual(published()[0].body.data.messageIds, [41]);
  });

  it('keeps a stranger out of another match', async () => {
    process.env.ABLY_API_KEY = KEY;
    const db = fakeDb(baseTables({ matches: [] }));
    await assert.rejects(() => callerOf(SENDER, db).markRead({ matchId: MATCH_ID, messageIds: [1] }), {
      code: 'NOT_FOUND',
    });
    assert.equal(published().length, 0);
  });
});

describe('social.notifyTyping', () => {
  it('shows the indicator on the peer socket and never on the author', async () => {
    const db = fakeDb(baseTables());
    const peerEvents = capture(PEER);
    const authorEvents = capture(SENDER);

    await callerOf(SENDER, db).notifyTyping({ matchId: MATCH_ID });

    assert.deepEqual(peerEvents, [{ type: 'chat.typing', matchId: MATCH_ID, fromId: SENDER }]);
    assert.deepEqual(authorEvents, []);
  });

  it('names the author in the Ably envelope so the browser can filter itself', async () => {
    process.env.ABLY_API_KEY = KEY;
    await callerOf(SENDER, fakeDb(baseTables())).notifyTyping({ matchId: MATCH_ID });

    assert.equal(published().length, 1);
    assert.equal(published()[0].body.name, 'chat.typing');
    assert.equal(published()[0].body.data.actorId, SENDER);
    assert.equal(published()[0].body.data.fromId, SENDER);
  });

  it('requires membership before it publishes', async () => {
    process.env.ABLY_API_KEY = KEY;
    const db = fakeDb(baseTables({ matches: [] }));
    await assert.rejects(() => callerOf(SENDER, db).notifyTyping({ matchId: MATCH_ID }), { code: 'NOT_FOUND' });
    assert.equal(published().length, 0);
  });
});
