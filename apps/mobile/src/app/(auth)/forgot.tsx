import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AuthApiError, requestPasswordReset } from '@/api/auth';
import { Button, Eyebrow, Field, Notice, Screen, Subtitle, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { spacing } from '@/theme/tokens';

export default function ForgotScreen() {
  const { t } = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorKey('auth.enterEmail');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    try {
      // Сервер завжди відповідає {ok:true}, щоб не розкривати існування акаунта.
      await requestPasswordReset(trimmed);
      router.push({ pathname: '/reset', params: { email: trimmed } });
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

      <Title>{t('auth.forgotPassword')}</Title>
      <Subtitle>{t('auth.enterEmail')}</Subtitle>

      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        autoCorrect={false}
        maxLength={254}
      />

      {errorKey ? <Notice kind="error">{t(errorKey)}</Notice> : null}

      <Button label={t('auth.sendResetLink')} onPress={submit} busy={busy} />
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
