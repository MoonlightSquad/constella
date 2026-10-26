import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { consumeAuthToken, hashOpaqueToken, issueAuthToken } from './auth-tokens.js';

/** Код має проходити регулярку `POST /internal/telegram-link/complete` і regex base64url. */
const LINK_CODE_RE = /^[A-Za-z0-9_-]{43}$/;

type FakeRow = { id: string; userId: string; tokenHash: string; purpose: string; expiresAt: Date; usedAt: Date | null };

const fakeDb = (rows: FakeRow[]) => {
  const journal: string[] = [];
  return {
    rows,
    journal,
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          journal.push('select');
          void condition;
          return {
            limit: () =>
              Promise.resolve(
                rows.filter((row) => row.usedAt === null && row.expiresAt > new Date()).map(({ id }) => ({ id }))
              ),
          };
        },
      }),
    }),
    insert: () => ({
      values: (value: Omit<FakeRow, 'id' | 'usedAt'> & { usedAt?: Date | null }) => {
        journal.push('insert');
        rows.push({ id: `row-${rows.length + 1}`, usedAt: null, ...value });
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (patch: Partial<FakeRow>) => ({
        where: () => {
          journal.push('update');
          rows.forEach((row, index) => rows[index] = { ...row, ...patch });
          return {
            returning: () => Promise.resolve(rows.filter((row) => patch.usedAt && row.usedAt).map(({ userId }) => ({ userId }))),
          };
        },
      }),
    }),
  };
};

describe('auth tokens', () => {
  it('hashes codes so the raw value never reaches the database', () => {
    const hash = hashOpaqueToken('abc');
    assert.match(hash, /^[a-f\d]{64}$/);
    assert.notEqual(hash, 'abc');
    assert.equal(hash, hashOpaqueToken('abc'));
  });

  it('issues a telegram link code the internal endpoint accepts and stores only its hash', async () => {
    const db = fakeDb([]);
    const code = await issueAuthToken(db, 'user-1', 'telegram_link');
    assert.match(code, LINK_CODE_RE);
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0].userId, 'user-1');
    assert.equal(db.rows[0].purpose, 'telegram_link');
    assert.equal(db.rows[0].tokenHash, hashOpaqueToken(code));
    assert.equal(db.rows[0].usedAt, null);

    const ttlMinutes = (db.rows[0].expiresAt.getTime() - Date.now()) / 60_000;
    assert.ok(ttlMinutes > 9 && ttlMinutes <= 10, `telegram_link TTL should be ~10 minutes, got ${ttlMinutes}`);
  });

  it('revokes previous codes of the same purpose before issuing a new one', async () => {
    const db = fakeDb([]);
    await issueAuthToken(db, 'user-1', 'telegram_link');
    await issueAuthToken(db, 'user-1', 'telegram_link');
    assert.deepEqual(db.journal.slice(0, 2), ['update', 'insert']);
    assert.equal(db.rows.length, 2);
    assert.equal(db.rows[0].usedAt instanceof Date, true, 'the first code is voided by the second issue');
    assert.equal(db.rows[1].usedAt, null);
  });

  it('uses the longest TTL for email verification', async () => {
    const db = fakeDb([]);
    await issueAuthToken(db, 'user-1', 'email_verification');
    const ttlHours = (db.rows[0].expiresAt.getTime() - Date.now()) / 3_600_000;
    assert.ok(ttlHours > 23 && ttlHours <= 24);
  });

  it('consumes a live code exactly once', async () => {
    const now = Date.now();
    const db = fakeDb([
      {
        id: 'row-1',
        userId: 'user-1',
        tokenHash: hashOpaqueToken('code'),
        purpose: 'telegram_link',
        expiresAt: new Date(now + 60_000),
        usedAt: null,
      },
    ]);
    assert.deepEqual(await consumeAuthToken(db, 'code', 'telegram_link'), { userId: 'user-1' });
    assert.equal(db.rows[0].usedAt instanceof Date, true);
  });

  it('refuses expired, used and unknown codes', async () => {
    const now = Date.now();
    const expired = fakeDb([
      { id: 'row-1', userId: 'user-1', tokenHash: hashOpaqueToken('code'), purpose: 'telegram_link', expiresAt: new Date(now - 1), usedAt: null },
    ]);
    assert.equal(await consumeAuthToken(expired, 'code', 'telegram_link'), null);
    assert.deepEqual(expired.journal, ['select'], 'an unreadable code must not reach the claim update');

    const used = fakeDb([
      { id: 'row-1', userId: 'user-1', tokenHash: hashOpaqueToken('code'), purpose: 'telegram_link', expiresAt: new Date(now + 60_000), usedAt: new Date(now) },
    ]);
    assert.equal(await consumeAuthToken(used, 'code', 'telegram_link'), null);

    const empty = fakeDb([]);
    assert.equal(await consumeAuthToken(empty, 'never-issued', 'telegram_link'), null);
  });
});
