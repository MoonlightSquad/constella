import { useState } from 'react';
import { useRouter } from 'expo-router';

import { AuthApiError, deleteAccount } from '@/api/auth';
import { useSession } from '@/auth/session';
import { Button, Checkbox, Eyebrow, Field, Notice, Screen, Subtitle, Title } from '@/components/ui';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';

export default function DeleteAccountScreen() {
  const { t } = useLocale();
  const { signOut } = useSession();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const submit = async () => {
    setBusy(true);
    setErrorKey(null);
    try {
      await deleteAccount(password);
      await signOut();
      // `account.deleted` переживає редирект як query — як notice після `app.vue:222`.
      router.replace('/login?deleted=1');
    } catch (error) {
      setErrorKey(
        error instanceof AuthApiError
          ? error.status === 401
            ? 'auth.loginError'
            : error.status === 503
              ? 'app.apiOffline'
              : error.messageKey
          : 'account.deleteFailed',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Eyebrow>{t('auth.eyebrow')}</Eyebrow>
      <Title>{t('account.deleteAccount')}</Title>
      <Subtitle>{t('account.deleteWarning')}</Subtitle>

      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        maxLength={72}
      />

      <Checkbox label={t('account.deleteConfirm')} checked={confirmed} onChange={setConfirmed} />

      {errorKey ? <Notice kind="error">{t(errorKey)}</Notice> : null}

      <Button label={t('account.deleteSubmit')} onPress={submit} busy={busy} disabled={!confirmed} />
      <Button variant="link" label={t('profile.cancel')} onPress={() => router.back()} />
    </Screen>
  );
}
