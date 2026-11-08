import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getTableName } from 'drizzle-orm';
import { messages } from '@constella/db';
import { updateChatMessageFromSocket } from './message-actions.js';

const MESSAGE_ID = 17;
const MATCH_ID = '7c1a2b34-5d6e-4f70-8a91-b2c3d4e5f607';
const SENDER = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';

const fakeDb = (rows: any[] = []) => {
  const writes: any[] = [];
  return {
    writes,
    select: () => ({
      from: (table: any) => ({
        where: (condition: any) => ({
          limit: async () => {
            writes.push({ kind: 'select', table: getTableName(table), condition });
            return rows;
          },
        }),
      }),
    }),
    update: (table: any) => ({
      set: (patch: any) => ({
        where: (condition: any) => ({
          returning: async () => {
            writes.push({ kind: 'update', table: getTableName(table), patch, condition });
            return rows;
          },
        }),
      }),
    }),
  };
};

const query = (condition: any) => condition.toQuery({
  escapeName: (name: string) => `"${name}"`,
  escapeParam: (index: number) => `$${index + 1}`,
  inlineParams: false,
});

describe('chat WebSocket message actions', () => {
  it('limits linked-message updates to the author', async () => {
    const db = fakeDb();
    await updateChatMessageFromSocket(db, {
      type: 'send.linked', messageId: MESSAGE_ID, matchId: MATCH_ID, userId: SENDER, body: 'updated',
    });

    const update = db.writes[0];
    assert.equal(update.table, getTableName(messages));
    const where = query(update.condition);
    assert.match(where.sql, /"sender_id"/);
    assert.ok(where.params.includes(SENDER));
    assert.equal(update.patch.body, 'updated');
  });

  it('pins the stored body without accepting client-supplied replacement content', async () => {
    const originalBody = JSON.stringify({ kind: 'image', url: 'https://media.example/image.webp' });
    const db = fakeDb([{ body: originalBody }]);
    await updateChatMessageFromSocket(db, {
      type: 'send.pin', messageId: MESSAGE_ID, matchId: MATCH_ID, userId: PEER, body: 'client replacement',
    });

    const update = db.writes[1];
    assert.deepEqual(JSON.parse(update.patch.body), { kind: 'image', url: 'https://media.example/image.webp', pinned: true });
    const where = query(update.condition);
    assert.match(where.sql, /"body"/);
    assert.ok(where.params.includes(originalBody), 'the update must not overwrite a concurrently changed message');
  });

  it('does not rewrite non-object message bodies when pinning', async () => {
    const db = fakeDb([{ body: 'plain text' }]);
    const result = await updateChatMessageFromSocket(db, {
      type: 'send.pin', messageId: MESSAGE_ID, matchId: MATCH_ID, userId: PEER, body: 'plain text',
    });

    assert.equal(result, null);
    assert.equal(db.writes.length, 1, 'only the read is allowed for a non-object body');
  });
});
