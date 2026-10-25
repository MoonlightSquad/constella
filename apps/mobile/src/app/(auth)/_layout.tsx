import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export { RouteError as ErrorBoundary } from '@/components/route-error';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
