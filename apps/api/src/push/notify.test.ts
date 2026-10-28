import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { notifyBroadcast, notifyUser } from './notify.js';

const originalFetch = globalThis.fetch;
const originalSecret = process.env.EXPO_PUSH_ACCESS_TOKEN;
const originalFallback = process.env.EXPO_ACCESS_TOKEN;

after(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.EXPO_PUSH_ACCESS_TOKEN;
  else process.env.EXPO_PUSH_ACCESS_TOKEN = originalSecret;
  if (originalFallback === undefined) delete process.env.EXPO_ACCESS_TOKEN;
  else process.env.EXPO_ACCESS_TOKEN = originalFallback;
});

/** Мімікує ті ланцюжки drizzle, якими користується `notifyUser`. */
const fakeDb = (tokens: string[], deletions: unknown[] = []) => ({
  select: () => ({ from: () => ({ where: () => Promise.resolve(tokens.map((pushToken) => ({ pushToken }))) }) }),
  delete: () => ({ where: (condition: unknown) => { deletions.push(condition); return Promise.resolve(); } }),
});

const tickets = (statuses: ('ok' | 'error')[]) =>
  new Response(
    JSON.stringify({
      data: statuses.map((status) =>
        status === 'ok' ? { status } : { status, message: 'not registered', details: { error: 'DeviceNotRegistered' } }
      ),
    }),
    { status: 200 }
  );

describe('Expo push fan-out', () => {
  it('does nothing without a push secret', async () => {
    delete process.env.EXPO_PUSH_ACCESS_TOKEN;
    delete process.env.EXPO_ACCESS_TOKEN;
    let queried = false;
    const db = {
      select: () => {
        queried = true;
        throw new Error('must not query the device table');
      },
    };
    await notifyUser(db, 'user-1', { title: 'Constella', body: 'Привіт' });
    assert.equal(queried, false);
  });

  it('ignores tokens that are not Expo push tokens', async () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = 'secret';
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return tickets(['ok']);
    }) as typeof fetch;
    await notifyUser(fakeDb(['ExpoPushToken[short]']), 'user-1', { title: 'Constella', body: 'Привіт' });
    assert.equal(calls, 0);
  });

  it('splits devices into chunks and carries navigation data', async () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = 'secret';
    const tokens = Array.from({ length: 120 }, (_, index) => `ExponentPushToken[${String(index).padStart(12, '0')}]`);
    const bodies: any[][] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      const chunk = JSON.parse(init.body);
      bodies.push(chunk);
      return tickets(chunk.map(() => 'ok'));
    }) as typeof fetch;

    const deletions: unknown[] = [];
    await notifyUser(fakeDb(tokens, deletions), 'user-1', {
      title: 'Constella',
      body: 'Новий матч!',
      data: { matchId: 'match-9', route: 'match/match-9' },
    });

    assert.deepEqual(bodies.map((chunk) => chunk.length), [100, 20]);
    assert.equal(bodies[0][0].to, tokens[0]);
    assert.deepEqual(bodies[0][0].data, { userId: 'user-1', matchId: 'match-9', route: 'match/match-9' });
    assert.equal(bodies[0][0].sound, 'default');
    assert.deepEqual(deletions, []);
  });

  it('silences a notification instead of dropping it, and accepts the fallback secret', async () => {
    delete process.env.EXPO_PUSH_ACCESS_TOKEN;
    process.env.EXPO_ACCESS_TOKEN = 'fallback-secret';
    let body: any;
    globalThis.fetch = (async (_url: any, init: any) => {
      body = JSON.parse(init.body)[0];
      return tickets(['ok']);
    }) as typeof fetch;
    await notifyUser(fakeDb(['ExponentPushToken[aaaaaaaaaaaa]']), 'user-1', {
      title: 'Constella',
      body: 'Нагадування',
      silent: true,
    });
    assert.equal(body.sound, null);
  });

  it('prunes devices Expo reports as unregistered', async () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = 'secret';
    const deletions: unknown[] = [];
    globalThis.fetch = (async () => tickets(['error', 'ok'])) as typeof fetch;
    await notifyUser(fakeDb(['ExponentPushToken[aaaaaaaaaaaa]', 'ExpoPushToken[bbbbbbbbbbbb]'], deletions), 'user-1', {
      title: 'Constella',
      body: 'Привіт',
    });
    assert.equal(deletions.length, 1);
  });

  it('never rejects the business call when Expo is unreachable', async () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = 'secret';
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await notifyUser(fakeDb(['ExponentPushToken[aaaaaaaaaaaa]']), 'user-1', { title: 'Constella', body: 'Привіт' });
  });
});

/** 25 зон, що покривають усі зміщення від UTC — тож хоча б одна людина точно в тихій годині. */
const ZONES = Array.from({ length: 25 }, (_, index) => {
  const offset = index - 12;
  return offset === 0 ? 'Etc/UTC' : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
});
const tokenFor = (index: number) => `ExponentPushToken[${String(index).padStart(12, '0')}]`;

const broadcastDb = () => ({
  delete: () => ({ where: () => Promise.resolve() }),
});

describe('admin push broadcast', () => {
  it('sends nothing when the push secret is missing', async () => {
    delete process.env.EXPO_PUSH_ACCESS_TOKEN;
    delete process.env.EXPO_ACCESS_TOKEN;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return tickets(['ok']);
    }) as typeof fetch;
    const result = await notifyBroadcast(broadcastDb(), { title: 'Constella', body: 'Привіт' }, [
      { userId: 'user-1', pushToken: tokenFor(1), timeZone: 'Etc/UTC' },
    ]);
    assert.equal(calls, 0);
    assert.equal(result.recipients, 1);
    assert.equal(result.accepted, 0);
    assert.equal(result.dropped, 0);
  });

  it('drops tokens the registry should not have kept', async () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = 'secret';
    const sent: any[][] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      sent.push(JSON.parse(init.body));
      return tickets(JSON.parse(init.body).map(() => 'ok'));
    }) as typeof fetch;
    const result = await notifyBroadcast(broadcastDb(), { title: 'Constella', body: 'Привіт' }, [
      { userId: 'user-1', pushToken: 'ExpoPushToken[short]' },
      { userId: 'user-2', pushToken: 'whatever://token' },
      { userId: 'user-3', pushToken: tokenFor(3) },
    ]);
    assert.equal(result.recipients, 1);
    assert.deepEqual(sent.flat().map((ticket) => ticket.to), [tokenFor(3)]);
  });

  it('judges the quiet hour per recipient, not per broadcast', async () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = 'secret';
    const sent: any[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      const chunk = JSON.parse(init.body);
      sent.push(...chunk);
      return tickets(chunk.map(() => 'ok'));
    }) as typeof fetch;
    const result = await notifyBroadcast(
      broadcastDb(),
      { title: 'Constella', body: 'Реліз' },
      ZONES.map((timeZone, index) => ({ userId: `user-${index}`, pushToken: tokenFor(index), timeZone })),
    );

    const silent = sent.filter((ticket) => ticket.sound === null);
    assert.equal(sent.length, ZONES.length);
    assert.equal(result.recipients, ZONES.length);
    assert.equal(result.quiet, silent.length);
    assert.ok(silent.length > 0 && silent.length < ZONES.length, `expected a mix of quiet and loud zones, got ${silent.length}`);
    assert.ok(sent.every((ticket) => ticket.data.broadcast === true));
  });

  it('chunks a large audience and counts what Expo accepted', async () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = 'secret';
    const sizes: number[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      const chunk = JSON.parse(init.body);
      sizes.push(chunk.length);
      // Один протухлий токен на чанк, решта — доставлено.
      return tickets(chunk.map((_: unknown, index: number) => (index === 0 ? 'error' : 'ok')));
    }) as typeof fetch;
    const result = await notifyBroadcast(
      broadcastDb(),
      { title: 'Constella', body: 'Реліз' },
      Array.from({ length: 250 }, (_, index) => ({ userId: `user-${index}`, pushToken: tokenFor(index), timeZone: 'Etc/UTC' })),
    );

    assert.deepEqual(sizes.sort((a, b) => b - a), [100, 100, 50]);
    assert.equal(result.accepted, 247);
    assert.equal(result.dropped, 3);
  });

  // `users.time_zone` пишеться з клієнта, тому сміття там — звична річ, і воно не має
  // ні валити розсилку, ні заглушати її.
  it('treats an unusable time zone as loud rather than throwing', async () => {
    process.env.EXPO_PUSH_ACCESS_TOKEN = 'secret';
    const sent: any[] = [];
    globalThis.fetch = (async (_url: any, init: any) => {
      const chunk = JSON.parse(init.body);
      sent.push(...chunk);
      return tickets(chunk.map(() => 'ok'));
    }) as typeof fetch;
    const result = await notifyBroadcast(broadcastDb(), { title: 'Constella', body: 'Реліз' }, [
      { userId: 'user-1', pushToken: tokenFor(1), timeZone: 'Kyiv' },
      { userId: 'user-2', pushToken: tokenFor(2), timeZone: '' },
      { userId: 'user-3', pushToken: tokenFor(3), timeZone: null },
    ]);
    assert.equal(result.quiet, sent.filter((ticket) => ticket.sound === null).length);
    assert.equal(result.accepted, 3);
  });
});
