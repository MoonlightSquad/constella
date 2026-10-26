import Constants from 'expo-constants';

const trim = (value: string) => value.replace(/\/+$/, '');

const configured =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

/**
 * Базовий URL API. `EXPO_PUBLIC_*` інлайниться у бандл на білді, тому для локальної
 * підміни (ngrok/LAN) треба перезапуск `expo start`, а не перевипуск APK.
 */
export const API_BASE_URL = trim(configured || 'https://api.constella.pp.ua');

/** `/api/chat/ws` той самий, що й у web: токен іде рядком запиту, не заголовком. */
export const CHAT_WS_URL = API_BASE_URL.replace(/^http/, 'ws');
