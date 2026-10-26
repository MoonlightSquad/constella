import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { AuthApiError, loginWeb, resendVerification } from '@/api/auth';
import { useSession } from '@/auth/session';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button, Eyebrow, Field, Notice, Screen, Subtitle, Title } from '@/components/ui';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { spacing } from '@/theme/tokens';

export default function LoginScreen() {
  const { t } = useLocale();
  const { signIn } = useSession();
  const router = useRouter();
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const [noticeKey, setNoticeKey] = useState<TranslationKey | null>(
    deleted === '1' ? 'account.deleted' : null,
  );
  const [needsVerification, setNeedsVerification] = useState(false);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setErrorKey('auth.enterEmail');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    setNoticeKey(null);
    setNeedsVerification(false);
    try {
      const session = await loginWeb({ email: trimmed, password });
      await signIn(session.token);
      router.replace('/');
    } catch (error) {
      if (error instanceof AuthApiError) {
        if (error.code === 'EMAIL_NOT_VERIFIED') setNeedsVerification(true);
        setErrorKey(error.messageKey);
      } else {
        setErrorKey('auth.genericError');
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setErrorKey(null);
    try {
      await resendVerification(email.trim());
      setNoticeKey('auth.checkInbox');
    } catch (error) {
      // 429 і відомі помилки API показуємо явно; лише справді невідомий збій
      // лишається під м'якою фразою — сервер навмисно не підтверджує існування адреси.
      if (error instanceof AuthApiError) setErrorKey(error.messageKey);
      else setNoticeKey('auth.verificationSent');
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

      <Title>{t('auth.titleLogin')}</Title>
      <Subtitle>{t('auth.subtitleWeb')}</Subtitle>

      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        maxLength={254}
        testID="auth.email"
      />
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        maxLength={72}
        testID="auth.password"
      />

      {errorKey ? <Notice kind="error">{t(errorKey)}</Notice> : null}
      {noticeKey ? <Notice kind="status">{t(noticeKey)}</Notice> : null}

      <Button label={t('auth.submitLogin')} onPress={submit} busy={busy} testID="auth.submit" />

      <Button variant="link" label={t('auth.forgotPassword')} onPress={() => router.push('/forgot')} />
      {needsVerification ? (
        <Button variant="link" label={t('auth.resendVerification')} onPress={resend} disabled={busy} />
      ) : null}
      <Button
        variant="link"
        label={t('auth.switchToRegister')}
        onPress={() => router.push('/register')}
      />

      <Subtitle>{t('profile.privacy')}</Subtitle>
    </Screen>
  );
}

const styles = {
  topline: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.md },
};
