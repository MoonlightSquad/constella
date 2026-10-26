import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { getTableName } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://constella:test@127.0.0.1:5432/constella';

const { socialRouter } = await import('./social.js');
const { registerConnection, resetConnections } = await import('../realtime.js');

const MATCH_ID = '7c1a2b34-5d6e-4f70-8a91-b2c3d4e5f607';
const SENDER = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => resetConnections());

type Probe = { kind: string; table: string; row?: any; patch?: any; sql?: string; params?: unknown[] };

/**
 * Міміка drizzle-ланцюжків, якими ходить `sendMessage`: `select().from().where().groupBy()`,
 * `insert().values().returning()` і `update().set().where().returning()`. Усе, що вони
 * роблять, пишеться в `probe`, тож тест бачить і порядок запитів, і їхні умови.
 */
const fakeDb = (tables: Record<string, any[]>, probe: Probe[] = [], marked: any[] = []) => ({
  select: () => {
    const chain = (name: string): any => ({
      from: (table: any) => chain(getTableName(table)),
      where: () => chain(name),
      orderBy: () => chain(name),
      limit: () => chain(name),
      groupBy: () => {
        probe.push({ kind: 'group', table: name });
        return Promise.resolve(tables[name] ?? []);
      },
      then: (onfulfilled: any, onrejected: any) => Promise.resolve(tables[name] ?? []).then(onfulfilled, onrejected),
    });
    return chain('');
  },
  insert: (table: any) => {
    const name = getTableName(table);
    return {
      values: (row: any) => {
        probe.push({ kind: 'insert', table: name, row });
        const stored = async () =>
          name === 'messages' ? [{ id: 99, createdAt: new Date('2026-10-26T10:00:00Z'), ...row }] : [];
        const self = { returning: stored };
        return { returning: stored, onConflictDoNothing: () => self, onConflictDoUpdate: () => self };
      },
    };
  },
  update: (table: any) => ({
    set: (patch: any) => ({
      where: (condition: any) => {
        const query = condition.toQuery({
          escapeName: (value: string) => `"${value}"`,
          escapeParam: (index: number) => `$${index + 1}`,
          inlineParams: false,
        });
        probe.push({ kind: 'update', table: getTableName(table), patch, sql: query.sql, params: query.params });
        return { returning: async () => marked };
      },
    }),
  }),
} as any);

const baseTables = (overrides: Record<string, any[]> = {}) => ({
  matches: [{ id: MATCH_ID, userOneId: SENDER, userTwoId: PEER }],
  blocked_users: [],
  users: [{ bannedAt: null, sessionVersion: 1, timeZone: 'Europe/Kyiv', xp: 0, level: 1 }],
  messages: [],
  user_achievements: [],
  quest_progress: [],
  ...overrides,
});

const callerOf = (userId: string, db: any) =>
  socialRouter.createCaller({ req: {} as any, res: {} as any, user: { id: userId, telegramId: null, sessionVersion: 1 }, db });

const capture = (userId: string) => {
  const events: any[] = [];
  registerConnection({
    userId,
    matchId: MATCH_ID,
    conn: { readyState: 1, send: (raw: string) => { events.push(JSON.parse(raw)); }, close: () => {}, on: () => {} },
  });
  return events;
};

const sent = (db: any, body = 'Привіт') => callerOf(SENDER, db).sendMessage({ matchId: MATCH_ID, body });

describe('social.sendMessage', () => {
  it('stores the row without claiming the peer device has it', async () => {
    const probe: Probe[] = [];
    await sent(fakeDb(baseTables(), probe));

    const insert = probe.find((entry) => entry.kind === 'insert' && entry.table === 'messages');
    assert.ok(insert, 'a messages row was inserted');
    // `delivered_at` тепер пише лише ack піра — інакше ✓✓ були б брехнею з першого рядка.
    assert.equal('deliveredAt' in insert!.row, false);
    assert.equal(insert!.row.matchId, MATCH_ID);
    assert.equal(insert!.row.senderId, SENDER);
  });

  it('announces the stored row exactly once', async () => {
    const events = capture(PEER);
    await sent(fakeDb(baseTables(), []));

    assert.deepEqual(events.map((event) => event.type), ['chat.message']);
    assert.equal(events[0].message.id, 99);
  });

  it('keeps the rate limit in front of the insert', async () => {
    const probe: Probe[] = [];
    const db = fakeDb(baseTables({ messages: [{ count: 12 }] }), probe);

    await assert.rejects(() => sent(db), { code: 'TOO_MANY_REQUESTS' });
    assert.equal(probe.some((entry) => entry.kind === 'insert'), false);
    assert.equal(probe.some((entry) => entry.kind === 'group'), false);
  });

  it('skips the history scans once the one-time achievements are on the account', async () => {
    const held = [
      { code: 'dialog-master' },
      { code: 'good-conversation' },
      { code: 'first-hello' },
    ];
    const fresh: Probe[] = [];
    await sent(fakeDb(baseTables(), fresh));
    const settled: Probe[] = [];
    await sent(fakeDb(baseTables({ user_achievements: held }), settled));

    // Без guard-у кожно повідомлення робило б два `GROUP BY` по всій історії відправника.
    assert.equal(fresh.filter((entry) => entry.kind === 'group').length, 2);
    assert.equal(settled.filter((entry) => entry.kind === 'group').length, 0);
  });

  it('refuses a match the caller is not part of', async () => {
    const probe: Probe[] = [];
    const db = fakeDb(baseTables({ matches: [] }), probe);
    await assert.rejects(() => sent(db), { code: 'NOT_FOUND' });
    assert.equal(probe.length, 0);
  });
});

describe('social.sendVoiceMessage', () => {
  it('stores the clip the same way as a text row', async () => {
    const probe: Probe[] = [];
    const db = fakeDb(baseTables(), probe);
    await callerOf(SENDER, db).sendVoiceMessage({ matchId: MATCH_ID, audioUrl: 'https://cdn.example/a.webm', durationSec: 4 });

    const insert = probe.find((entry) => entry.kind === 'insert' && entry.table === 'messages');
    assert.equal(insert!.row.kind, 'voice');
    assert.equal('deliveredAt' in insert!.row, false);
  });
});

describe('social.markDelivered', () => {
  it('touches only the peer rows that were not acknowledged yet', async () => {
    const probe: Probe[] = [];
    const db = fakeDb(baseTables(), probe, [{ id: 41, deliveredAt: new Date() }, { id: 42, deliveredAt: new Date() }]);

    const result = await callerOf(PEER, db).markDelivered({ matchId: MATCH_ID, messageIds: [41, 42] });

    assert.equal(result.marked, 2);
    const update = probe.find((entry) => entry.kind === 'update' && entry.table === 'messages');
    assert.match(update!.sql!, /"delivered_at" is null/i);
    assert.match(update!.sql!, /"sender_id" <>/);
    assert.ok(update!.params!.includes(PEER));
    assert.ok(update!.params!.includes(41) && update!.params!.includes(42));
  });

  it('carries the stamp to the author as one batched frame', async () => {
    const deliveredAt = new Date('2026-10-26T10:00:05Z');
    const db = fakeDb(baseTables(), [], [{ id: 41, deliveredAt }, { id: 42, deliveredAt }]);
    const authorEvents = capture(SENDER);

    await callerOf(PEER, db).markDelivered({ matchId: MATCH_ID, messageIds: [41, 42] });

    assert.equal(authorEvents.length, 1);
    assert.equal(authorEvents[0].type, 'presence.delivered');
    assert.deepEqual(authorEvents[0].messageIds, [41, 42]);
    assert.equal(authorEvents[0].messageId, 41);
    assert.equal(new Date(authorEvents[0].deliveredAt).getTime(), deliveredAt.getTime());
  });

  it('says nothing when every row already had its tick', async () => {
    const authorEvents = capture(SENDER);
    const result = await callerOf(PEER, fakeDb(baseTables(), [], [])).markDelivered({ matchId: MATCH_ID, messageIds: [7] });
    assert.equal(result.marked, 0);
    assert.deepEqual(authorEvents, []);
  });

  it('keeps a stranger out of another match', async () => {
    const db = fakeDb(baseTables({ matches: [] }));
    await assert.rejects(() => callerOf(SENDER, db).markDelivered({ matchId: MATCH_ID, messageIds: [1] }), {
      code: 'NOT_FOUND',
    });
  });
});
