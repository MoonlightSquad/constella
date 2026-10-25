import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { AuthApiError, completePasswordReset } from '@/api/auth';
import { Button, Eyebrow, Field, Notice, Screen, Subtitle, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { spacing } from '@/theme/tokens';

export default function ResetScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();

  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (password !== confirmPassword) {
      setErrorKey('auth.passwordMismatch');
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setErrorKey('auth.passwordTooLong');
      return;
    }
    if (token.trim().length < 32) {
      setErrorKey('auth.actionExpired');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    try {
      await completePasswordReset({ token: token.trim(), password, confirmPassword });
      setDone(true);
    } catch (error) {
      setErrorKey(error instanceof AuthApiError ? error.messageKey : 'auth.actionExpired');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <View style={styles.topline}>
          <Eyebrow>{t('auth.eyebrow')}</Eyebrow>
          <LanguageSwitcher />
        </View>
        <Title>{t('auth.resetSuccess')}</Title>
        <Button label={t('auth.submitLogin')} onPress={() => router.replace('/login')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topline}>
        <Eyebrow>{t('auth.eyebrow')}</Eyebrow>
        <LanguageSwitcher />
      </View>

      <Title>{t('auth.resetTitle')}</Title>
      <Subtitle>{t('auth.resetIntro')}</Subtitle>

      <Field
        label="token"
        value={token}
        onChangeText={setToken}
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={256}
      />
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        maxLength={72}
        hint={t('auth.passwordHint')}
      />
      <Field
        label={t('auth.confirmPassword')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
        maxLength={72}
      />

      {errorKey ? <Notice kind="error">{t(errorKey)}</Notice> : null}

      <Button label={t('auth.resetSubmit')} onPress={submit} busy={busy} />
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
