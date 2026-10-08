import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.DATABASE_URL ??= 'postgres://constella:test@127.0.0.1:5432/constella';
const { adminProcedure, isConfiguredAdmin, protectedProcedure, router } = await import('./trpc.js');

const makeContext = (user: any, session: any = { bannedAt: null, sessionVersion: 1 }) => ({
  req: {} as any,
  res: {} as any,
  user,
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => session ? [session] : [] }) }) }),
  } as any,
});
const originalAdminIds = process.env.ADMIN_USER_IDS;
const originalTelegramAdminIds = process.env.ADMIN_TELEGRAM_IDS;
after(() => {
  originalAdminIds === undefined ? delete process.env.ADMIN_USER_IDS : process.env.ADMIN_USER_IDS = originalAdminIds;
  originalTelegramAdminIds === undefined ? delete process.env.ADMIN_TELEGRAM_IDS : process.env.ADMIN_TELEGRAM_IDS = originalTelegramAdminIds;
});

describe('tRPC authorization middleware', () => {
  it('rejects protected calls without authentication', async () => {
    const testRouter = router({ value: protectedProcedure.query(() => 'secret') });
    await assert.rejects(testRouter.createCaller(makeContext(null)).value(), { code: 'UNAUTHORIZED' });
  });
  it('rejects missing accounts and stale session versions', async () => {
    const testRouter = router({ value: protectedProcedure.query(() => 'secret') });
    await assert.rejects(testRouter.createCaller(makeContext({ id: 'user', telegramId: null, sessionVersion: 1 }, null)).value(), { code: 'UNAUTHORIZED' });
    await assert.rejects(testRouter.createCaller(makeContext({ id: 'user', telegramId: null, sessionVersion: 0 })).value(), { code: 'UNAUTHORIZED' });
  });
  it('honors server allowlists for UUID and Telegram admins', () => {
    process.env.ADMIN_USER_IDS = 'user-1, user-2';
    process.env.ADMIN_TELEGRAM_IDS = '123,456';
    assert.equal(isConfiguredAdmin({ id: 'user-2', telegramId: null }), true);
    assert.equal(isConfiguredAdmin({ id: 'ordinary', telegramId: 456 }), true);
    assert.equal(isConfiguredAdmin({ id: 'ordinary', telegramId: 789 }), false);
    assert.equal(isConfiguredAdmin(null), false);
  });
  it('restricts admin procedures even for authenticated non-admins', async () => {
    process.env.ADMIN_USER_IDS = 'admin';
    const testRouter = router({ value: adminProcedure.query(() => 'admin') });
    await assert.rejects(testRouter.createCaller(makeContext({ id: 'user', telegramId: null, sessionVersion: 1 })).value(), { code: 'FORBIDDEN' });
    assert.equal(await testRouter.createCaller(makeContext({ id: 'admin', telegramId: null, sessionVersion: 1 })).value(), 'admin');
  });
  it('blocks suspended accounts except configured admins', async () => {
    process.env.ADMIN_USER_IDS = 'admin';
    const testRouter = router({ value: protectedProcedure.query(() => 'ok') });
    await assert.rejects(testRouter.createCaller(makeContext({ id: 'user', telegramId: null, sessionVersion: 1 }, { bannedAt: new Date(), sessionVersion: 1 })).value(), { code: 'FORBIDDEN' });
    assert.equal(await testRouter.createCaller(makeContext({ id: 'admin', telegramId: null, sessionVersion: 1 }, { bannedAt: new Date(), sessionVersion: 1 })).value(), 'ok');
  });
});
