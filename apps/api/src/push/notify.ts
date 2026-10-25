import { eq, inArray } from 'drizzle-orm';
import { pushDevices } from '@constella/db';
import { createLogger } from '@constella/shared';
import { getLocalHour } from '../engine/core.js';

const logger = createLogger('push');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

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

const pushSecret = () => process.env.EXPO_PUSH_ACCESS_TOKEN ?? process.env.EXPO_ACCESS_TOKEN;

/**
 * Fan-out через Expo REST. `expo-server-sdk` робить рівно це саме обгортаннями,
 * тому тут один `fetch` заміть залежності: той самий пакет не живе в нативному
 * рантаймі, а контракт (масив тікетів, `DeviceNotRegistered`) — стабільний.
 *
 * best-effort: помилка доставки не повинна валити бізнес-операцію (матч, платіж,
 * нагадування), тому все тіло загорнуте в try/catch і логується, як `notifyTelegram`.
 */
export const notifyUser = async (db: any, userId: string, notification: UserPush): Promise<void> => {
  const secret = pushSecret();
  if (!secret) return;

  const quiet =
    notification.silent ||
    (notification.userTimeZone ? isQuietHour(getLocalHour(notification.userTimeZone)) : false);

  try {
    const rows = await db
      .select({ pushToken: pushDevices.pushToken })
      .from(pushDevices)
      .where(eq(pushDevices.userId, userId));
    const tokens: string[] = rows
      .map((row: any) => row.pushToken as string)
      .filter((token: string) => EXPO_TOKEN_RE.test(token));
    if (!tokens.length) return;

    const dead: string[] = [];
    for (let offset = 0; offset < tokens.length; offset += CHUNK_SIZE) {
      const chunk = tokens.slice(offset, offset + CHUNK_SIZE);
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(
          chunk.map((token) => ({
            to: token,
            title: notification.title,
            body: notification.body,
            data: { userId, ...(notification.data ?? {}) },
            sound: quiet ? null : 'default',
          })),
        ),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        logger.warn('Expo push endpoint rejected the request', { status: response.status, userId });
        continue;
      }
      const payload = (await response.json()) as {
        data?: { status: string; message?: string; details?: { error?: string } }[];
      };
      payload.data?.forEach((ticket, index) => {
        if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(chunk[index]);
        }
      });
    }

    // Протухлі токени (перепрошений білд, видалений застосунок) знімаємо, інакше
    // таблиця назавжди залишається сміттям і кожен фан-аут повзе через них.
    if (dead.length) {
      await db.delete(pushDevices).where(inArray(pushDevices.pushToken, dead));
      logger.info('Dropped unregistered push devices', { userId, count: dead.length });
    }
  } catch (error) {
    logger.warn('Expo push failed', {
      userId,
      message: error instanceof Error ? error.message : 'Unknown push error',
    });
  }
};
