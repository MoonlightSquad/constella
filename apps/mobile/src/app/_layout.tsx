import '@/polyfills';
import { Sentry } from '@/sentry';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/auth/session';
import { LocaleProvider } from '@/i18n/locale-provider';
import { colors } from '@/theme/tokens';

function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: colors.bg },
            }}
          />
        </SessionProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}

// Sentry.wrap додає глобальний ErrorBoundary (стабільний для expo-router) навіть
// коли SDK вимкнено без DSN — просто нікуди не надсилатиме події.
export default Sentry.wrap(RootLayout);
