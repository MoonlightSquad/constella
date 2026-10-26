import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

/**
 * Sentry для мобілки вмикається лише з реальним DSN (EXPO_PUBLIC_SENTRY_DSN
 * інлайниться на білді, як і EXPO_PUBLIC_API_URL). У Expo Go нативної частини
 * SDK немає, тому там ініціалізацію пропускаємо — JS лишається чистим.
 */
const dsn = String(process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();
const placeholder = /PUBLIC_KEY|public_key/i.test(dsn);
const inExpoGo = Constants.appOwnership === 'expo';

export const sentryEnabled = Boolean(dsn) && !placeholder && !inExpoGo;

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    // Лише відлов помилок; трейсинг вимкнено свідомо.
    tracesSampleRate: 0,
  });
}

export { Sentry };
