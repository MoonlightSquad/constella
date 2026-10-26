import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { trpc } from '@/api/trpc';
import { STORAGE_KEYS, clearSecret, readSecret, writeSecret } from '@/storage';

const CHANNEL_ID = 'constella-default';

export type PushState = 'registered' | 'unsupported' | 'denied' | 'error';

/**
 * Без хендлера пуш, який прийшов у foreground, на Android не показується взагалі.
 * Тихі години сервер вирішує сам (`apps/api/src/push/notify.ts`), тому тут лише показ.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Токен пристрою змінюється рідко, тому повторна реєстрація в тому ж запуску зайва. */
let registeredToken: string | null = null;

const askPermission = async () => {
  if (!Device.isDevice) return 'unsupported' as const;
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return 'granted' as const;
  if (!current.canAskAgain) return 'denied' as const;
  const asked = await Notifications.requestPermissionsAsync();
  if (asked.status !== 'granted') return 'denied' as const;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Constella',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#d9b879',
    });
  }
  return 'granted' as const;
};

export const registerPushDevice = async (): Promise<PushState> => {
  const permission = await askPermission();
  if (permission !== 'granted') return permission;
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    if (token.data === registeredToken) return 'registered';
    await trpc.push.registerToken.mutate({
      pushToken: token.data,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    await writeSecret(STORAGE_KEYS.pushToken, token.data);
    registeredToken = token.data;
    return 'registered';
  } catch {
    // Емулятори без Play Services і Expo Go на simulator-і кидають тут — це не фатально.
    return 'error';
  }
};

/** Викликається на logout: чужий акаунт не повинен залишатися прив'язаним до пристрою. */
export const unregisterPushDevice = async () => {
  registeredToken = null;
  const pushToken = await readSecret(STORAGE_KEYS.pushToken);
  await clearSecret(STORAGE_KEYS.pushToken);
  if (!pushToken) return;
  try {
    await trpc.push.unregisterToken.mutate({ pushToken });
  } catch {
    // Logout не повинен падати через недоступний пуш-роутер.
  }
};

/**
 * Сервер кладе в `data` або `matchId` (+`route: 'match/<id>'`), або лише `route`.
 * Повертаємо лише структуровані маршрути згенерованого типу — довільний рядок із
 * payload у `router.push` потрапити не може.
 */
export type PushTarget =
  | { pathname: '/match/[matchId]'; params: { matchId: string } }
  | { pathname: '/sky' | '/chats' | '/quests' | '/sparks' | '/' };

const TAB_ROUTES: Record<string, PushTarget> = {
  '': { pathname: '/' },
  orbit: { pathname: '/' },
  sky: { pathname: '/sky' },
  chats: { pathname: '/chats' },
  quests: { pathname: '/quests' },
  sparks: { pathname: '/sparks' },
};

export const targetFromPush = (payload: unknown): PushTarget | null => {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  const matchId = typeof data.matchId === 'string' ? data.matchId : '';
  if (/^[\w-]{1,64}$/.test(matchId)) return { pathname: '/match/[matchId]', params: { matchId } };
  const route = typeof data.route === 'string' ? data.route.replace(/^\/+|\/+$/g, '') : '';
  const [head] = route.split('/');
  return TAB_ROUTES[head] ?? null;
};

/** Реєстрація пристрою + навігація по тапу. Викликати всередині захищеної групи. */
export function usePushNotifications(): PushState {
  const router = useRouter();
  const [state, setState] = useState<PushState>('unsupported');
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const next = await registerPushDevice();
      if (!cancelled) setState(next);
    };
    void sync();
    const tokenListener = Notifications.addPushTokenListener(() => void sync());
    const appState = AppState.addEventListener('change', (status) => {
      if (status === 'active') void sync();
    });
    return () => {
      cancelled = true;
      tokenListener.remove();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    if (!response) return;
    const target = targetFromPush(response.notification.request.content.data);
    Notifications.clearLastNotificationResponse();
    if (target) router.push(target);
  }, [response, router]);

  return state;
}
