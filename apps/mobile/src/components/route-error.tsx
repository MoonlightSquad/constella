import { TRPCClientError } from '@trpc/client';
import type { ErrorBoundaryProps } from 'expo-router';

import { Button, Eyebrow, Notice, Screen, Title } from '@/components/ui';
import { useLocale } from '@/i18n/locale-provider';

/** Різні версії RN і tRPC повідомляють про мережевий збій різними рядками — зводимо їх до одного. */
const isOffline = (error: Error) =>
  error instanceof TRPCClientError
    ? error.data?.code === 'UNAVAILABLE' || /network|fetch|timeout/i.test(error.message)
    : /network request failed|failed to fetch|timeout/i.test(error.message);

export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useLocale();
  return (
    <Screen>
      <Eyebrow>{t('app.errorEyebrow')}</Eyebrow>
      <Title>{t('app.errorTitle')}</Title>
      <Notice kind="error">{isOffline(error) ? t('app.apiOffline') : error.message}</Notice>
      <Button label={t('app.retry')} onPress={() => void retry()} />
    </Screen>
  );
}
