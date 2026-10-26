import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuthApiError, completeVerification, resendVerification } from '@/api/auth';
import { Button, Eyebrow, Field, Notice, Screen, Subtitle, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { spacing } from '@/theme/tokens';

/**
 * Лист підтвердження веде на веб-застосунок, тому тут два шляхи: відкрити посилання
 * у браузері (deep link `constella://verify?token=…`) або вставити токен вручну.
 */
export default function VerifyScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; token?: string }>();

  const [token, setToken] = useState(params.token ?? '');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [noticeKey, setNoticeKey] = useState<TranslationKey | null>('auth.checkInbox');
  const email = params.email ?? '';

  const submit = async (value: string) => {
    if (value.trim().length < 32) {
      setErrorKey('auth.actionExpired');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    setNoticeKey(null);
    try {
      await completeVerification(value.trim());
      setNoticeKey('auth.verifySuccess');
      router.replace('/login');
    } catch (error) {
      setErrorKey(error instanceof AuthApiError ? error.messageKey : 'auth.actionExpired');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!email) {
      setErrorKey('auth.enterEmail');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    setNoticeKey(null);
    try {
      await resendVerification(email);
      setNoticeKey('auth.checkInbox');
    } catch (error) {
      setErrorKey(error instanceof AuthApiError ? error.messageKey : 'auth.genericError');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topline}>
        <Eyebrow>{t('auth.eyebrow')}</Eyebrow>
        <LanguageSwitcher />
      </View>

      <Title>{t('auth.verifyFirst')}</Title>
      <Subtitle>{email}</Subtitle>

      {noticeKey ? <Notice kind="status">{t(noticeKey)}</Notice> : null}
      {errorKey ? <Notice kind="error">{t(errorKey)}</Notice> : null}

      <Field
        label="token"
        value={token}
        onChangeText={setToken}
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={256}
      />

      <Button label={t('app.retry')} onPress={() => submit(token)} busy={busy} />
      <Button variant="link" label={t('auth.resendVerification')} onPress={resend} disabled={busy} />
      <Button variant="link" label={t('auth.switchToLogin')} onPress={() => router.replace('/login')} />
    </Screen>
  );
}

const styles = {
  topline: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: spacing.md,
  },
};
