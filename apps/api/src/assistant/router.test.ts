import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getTableName } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/constella';

const { assistantRouter } = await import('./router.js');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MATCH_ID = '7c1a2b34-5d6e-4f70-8a91-b2c3d4e5f607';

const fakeDb = (tables: Record<string, any[]>) => ({
  select: () => {
    let name = '';
    const chain: any = {
      from: (table: any) => {
        name = getTableName(table);
        return chain;
      },
      where: () => chain,
      limit: async () => tables[name] ?? [],
    };
    return chain;
  },
  update: () => ({ set: () => ({ where: async () => undefined }) }),
});

const callerOf = (db: any) => assistantRouter.createCaller({
  req: {} as any,
  res: {} as any,
  user: { id: USER_ID, telegramId: null, sessionVersion: 1 },
  db,
});

const withAssistantEnabled = async (run: () => Promise<void>) => {
  const previous = process.env.AI_ASSISTANT_ENABLED;
  process.env.AI_ASSISTANT_ENABLED = 'true';
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.AI_ASSISTANT_ENABLED;
    else process.env.AI_ASSISTANT_ENABLED = previous;
  }
};

describe('assistant.suggest authorization', () => {
  it('rejects a free account before attempting inference', async () => {
    await withAssistantEnabled(async () => {
      const caller = callerOf(fakeDb({
        users: [{ bannedAt: null, sessionVersion: 1, role: 'user' }],
        user_entitlements: [],
        matches: [],
      }));

      await assert.rejects(
        () => caller.suggest({ matchId: MATCH_ID, locale: 'en', topic: 'Travel' }),
        { code: 'FORBIDDEN' }
      );
    });
  });

  it('does not allow a Premium account to request suggestions for someone else’s match', async () => {
    await withAssistantEnabled(async () => {
      const caller = callerOf(fakeDb({
        users: [{ bannedAt: null, sessionVersion: 1, role: 'user' }],
        user_entitlements: [{ plan: 'vip', status: 'active', expiresAt: new Date(Date.now() + 60_000) }],
        matches: [],
      }));

      await assert.rejects(
        () => caller.suggest({ matchId: MATCH_ID, locale: 'en', topic: 'Travel' }),
        { code: 'NOT_FOUND' }
      );
    });
  });
});
