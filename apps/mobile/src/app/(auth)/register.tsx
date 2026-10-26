import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AuthApiError, registerWeb } from '@/api/auth';
import { Button, Checkbox, Eyebrow, Field, Notice, Screen, Subtitle, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { spacing } from '@/theme/tokens';

/** Локальні перевірки ті самі, що й у `apps/web/components/WebAuth.vue:28-49`. */
const localCheck = (
  password: string,
  confirmPassword: string,
  acceptedTerms: boolean,
): TranslationKey | null => {
  if (new TextEncoder().encode(password).length < 12) return 'auth.passwordHint';
  if (password !== confirmPassword) return 'auth.passwordMismatch';
  if (new TextEncoder().encode(password).length > 72) return 'auth.passwordTooLong';
  if (!acceptedTerms) return 'auth.acceptTerms';
  return null;
};

export default function RegisterScreen() {
  const { t } = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const submit = async () => {
    const local = localCheck(password, confirmPassword, acceptedTerms);
    if (local) {
      setErrorKey(local);
      return;
    }
    setBusy(true);
    setErrorKey(null);
    try {
      await registerWeb({
        email: email.trim(),
        password,
        confirmPassword,
        acceptedTerms: true,
      });
      router.push({ pathname: '/verify', params: { email: email.trim() } });
    } catch (error) {
      setErrorKey(error instanceof AuthApiError ? error.messageKey : 'auth.registerError');
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

      <Title>{t('auth.titleRegister')}</Title>
      <Subtitle>{t('auth.subtitleWeb')}</Subtitle>

      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        autoCorrect={false}
        maxLength={254}
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

      <Checkbox
        label={t('auth.acceptTerms')}
        checked={acceptedTerms}
        onChange={setAcceptedTerms}
      />

      {errorKey ? <Notice kind="error">{t(errorKey)}</Notice> : null}

      <Button label={t('auth.submitRegister')} onPress={submit} busy={busy} />
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
