import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack, usePathname } from 'expo-router';

import { useSession } from '@/auth/session';
import { Button, Screen, Subtitle, Title } from '@/components/ui';
import { useLocale } from '@/i18n/locale-provider';
import { ensureMicPermission } from '@/media/permissions';
import { usePushNotifications } from '@/notifications/push';
import { DashboardProvider } from '@/state/dashboard';
import { colors, spacing, typography } from '@/theme/tokens';

export { RouteError as ErrorBoundary } from '@/components/route-error';

/** Екрани, доступні до завершення онбордингу: профіль і вихід з акаунту. */
const PRE_ONBOARDING_ALLOWED = ['/profile', '/delete'];

export default function AppLayout() {
  const { status, me, refresh } = useSession();
  const pathname = usePathname();

  if (status === 'loading') return <StartingScreen />;
  if (status === 'anonymous') return <Redirect href="/login" />;
  if (status === 'offline') return <OfflineScreen onRetry={() => void refresh()} />;
  if (me && !me.onboardingComplete && !PRE_ONBOARDING_ALLOWED.includes(pathname)) {
    return <Redirect href="/profile" />;
  }

  return (
    <DashboardProvider>
      <PushBridge />
      <MediaBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </DashboardProvider>
  );
}

/** Реєстрація push-пристрою та навігація по тапу — living всередині захищеної групи. */
function PushBridge() {
  usePushNotifications();
  return null;
}

/** Дозвіл на мікрофон питимо тут, а не посеред затискання кнопки запису. */
function MediaBridge() {
  useEffect(() => {
    void ensureMicPermission();
  }, []);
  return null;
}

function StartingScreen() {
  const { t } = useLocale();
  return (
    <View style={styles.shell}>
      <Text style={styles.mark}>✦</Text>
      <ActivityIndicator color={colors.mint} />
      <Text style={styles.text}>{t('app.starting')}</Text>
    </View>
  );
}

function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <Screen>
      <Title>{t('app.errorTitle')}</Title>
      <Subtitle>{t('app.apiOffline')}</Subtitle>
      <Button variant="secondary" label={t('app.retry')} onPress={onRetry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  mark: { fontSize: 34, color: colors.gold },
  text: { ...typography.body, color: colors.mutedSoft, textAlign: 'center' },
});
