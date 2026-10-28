import { eq, inArray } from 'drizzle-orm';
import { pushDevices } from '@constella/db';
import { createLogger } from '@constella/shared';
import { getLocalHour } from '../engine/core.js';

const logger = createLogger('push');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;
const CHUNK_CONCURRENCY = 4;

/** Формат токена валідує і Expo, і наш реєстр: `ExponentPushToken[...]` / `ExpoPushToken[...]`. */
export const EXPO_TOKEN_RE = /^Expo(?:nent)?PushToken\[[^[\]]{10,255}\]$/;

export type UserPush = {
  title: string;
  body: string;
  /** Навігаційні дані для тапу по пушу: `matchId` → `constella://match/<id>` у мобільному. */
  data?: Record<string, unknown>;
  silent?: boolean;
  /** Той самий тихий режим 23:00–08:00, що в `notifyTelegram` (`engine/core.ts:356`). */
  userTimeZone?: string;
};

/** Ті самі нічні години, що й у `notifyTelegram`. */
const isQuietHour = (hour: number) => hour >= 23 || hour < 8;

/** Чи «тиха» зараз доба для користувача з цим часовим поясом — те саме, що й при звичайному пуші. */
export const isQuietFor = (timeZone?: string | null) => {
  try {
    return isQuietHour(getLocalHour(timeZone || 'UTC'));
  } catch {
    // `users.time_zone` приходить із клієнта, тож там буває сміття, а не IANA-назва.
    return false;
  }
};

const pushSecret = () => process.env.EXPO_PUSH_ACCESS_TOKEN ?? process.env.EXPO_ACCESS_TOKEN;

type Ticket = { token: string; userId: string; quiet: boolean };

const sendChunk = async (
  chunk: Ticket[],
  message: UserPush,
  secret: string,
  tag: Record<string, unknown>,
): Promise<{ accepted: number; dead: string[] }> => {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify(chunk.map((ticket) => ({
        to: ticket.token,
        title: message.title,
        body: message.body,
        data: { userId: ticket.userId, ...message.data, ...tag },
        sound: ticket.quiet ? null : 'default',
      }))),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      logger.warn('Expo push endpoint rejected the request', { status: response.status, ...tag });
      return { accepted: 0, dead: [] };
    }
    const payload = (await response.json()) as {
      data?: { status: string; message?: string; details?: { error?: string } }[];
    };
    const dead: string[] = [];
    let accepted = 0;
    payload.data?.forEach((receipt, index) => {
      if (receipt?.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') dead.push(chunk[index].token);
      else if (receipt?.status !== 'error') accepted += 1;
    });
    return { accepted, dead };
  } catch (error) {
    logger.warn('Expo push chunk failed', {
      ...tag,
      message: error instanceof Error ? error.message : 'Unknown push error',
    });
    return { accepted: 0, dead: [] };
  }
};

/**
 * Fan-out через Expo REST чанками по `CHUNK_SIZE`. `expo-server-sdk` робить рівно це саме
 * обгортаннями, тому тут один `fetch` замість залежності: той самий пакет не живе в нативному
 * рантаймі, а контракт (масив тікетів, `DeviceNotRegistered`) — стабільний.
 *
 * Запити ідуть хвилями по `CHUNK_CONCURRENCY`: послідовний перебір тисячі токенів не влізає в
 * один Vercel-виклик, а надто широка паралельність вже впирається в ліміти Expo.
 *
 * best-effort: помилка доставки не повинна валити бізнес-операцію (матч, платіж, нагадування),
 * тому кожен чанк загорнутий у try/catch і логується, як `notifyTelegram`.
 */
const deliver = async (
  tickets: Ticket[],
  message: UserPush,
  secret: string,
  tag: Record<string, unknown>,
) => {
  const chunks: Ticket[][] = [];
  for (let offset = 0; offset < tickets.length; offset += CHUNK_SIZE) chunks.push(tickets.slice(offset, offset + CHUNK_SIZE));

  let accepted = 0;
  const dead: string[] = [];
  for (let offset = 0; offset < chunks.length; offset += CHUNK_CONCURRENCY) {
    const results = await Promise.all(
      chunks.slice(offset, offset + CHUNK_CONCURRENCY).map((chunk) => sendChunk(chunk, message, secret, tag)),
    );
    for (const result of results) {
      accepted += result.accepted;
      dead.push(...result.dead);
    }
  }
  return { accepted, dead };
};

// Протухлі токени (перепрошений білд, видалений застосунок) знімаємо, інакше таблиця
// назавжди залишається сміттям і кожен фан-аут повзе через них.
const dropDead = async (db: any, dead: string[], context: Record<string, unknown>) => {
  if (!dead.length) return;
  await db.delete(pushDevices).where(inArray(pushDevices.pushToken, dead));
  logger.info('Dropped unregistered push devices', { count: dead.length, ...context });
};

export const notifyUser = async (db: any, userId: string, notification: UserPush): Promise<void> => {
  const secret = pushSecret();
  if (!secret) return;

  try {
    const quiet =
      notification.silent ||
      (notification.userTimeZone ? isQuietHour(getLocalHour(notification.userTimeZone)) : false);

    const rows = await db
      .select({ pushToken: pushDevices.pushToken })
      .from(pushDevices)
      .where(eq(pushDevices.userId, userId));
    const tokens: string[] = rows
      .map((row: any) => row.pushToken as string)
      .filter((token: string) => EXPO_TOKEN_RE.test(token));
    if (!tokens.length) return;

    const { dead } = await deliver(
      tokens.map((token) => ({ token, userId, quiet })),
      notification,
      secret,
      { userId },
    );
    await dropDead(db, dead, { userId });
  } catch (error) {
    logger.warn('Expo push failed', {
      userId,
      message: error instanceof Error ? error.message : 'Unknown push error',
    });
  }
};

export type BroadcastRecipient = { userId: string; pushToken: string; timeZone?: string | null };

export type BroadcastResult = { recipients: number; quiet: number; accepted: number; dropped: number };

/**
 * Розсилка з адмінки: той самий транспорт, що й у `notifyUser`, але тиха година рахується для
 * кожного отримувача окремо — «зараз 07:00» у Львові і в Алмати це різні повідомлення. Список
 * адресатів приходить уже вибраним: вибір аудиторії — справа роутера, бо тільки він знає, які
 * таблиці для цього потрібні.
 */
export const notifyBroadcast = async (
  db: any,
  message: { title: string; body: string },
  recipients: BroadcastRecipient[],
): Promise<BroadcastResult> => {
  const tickets = recipients
    .filter((row) => EXPO_TOKEN_RE.test(row.pushToken))
    .map((row) => ({
      token: row.pushToken,
      userId: row.userId,
      quiet: isQuietFor(row.timeZone),
    }));
  const quiet = tickets.filter((ticket) => ticket.quiet).length;
  const secret = pushSecret();
  if (!tickets.length || !secret) return { recipients: tickets.length, quiet, accepted: 0, dropped: 0 };

  const { accepted, dead } = await deliver(
    tickets,
    { ...message, data: { broadcast: true } },
    secret,
    { broadcast: true },
  );
  await dropDead(db, dead, { broadcast: true });
  return { recipients: tickets.length, quiet, accepted, dropped: dead.length };
};
