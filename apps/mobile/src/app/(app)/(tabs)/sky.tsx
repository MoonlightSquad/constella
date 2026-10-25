import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { TRPCClientError } from '@trpc/client';

import { trpc } from '@/api/trpc';
import { useSession } from '@/auth/session';
import { Button, Checkbox, Eyebrow, Field, Notice, Screen, Subtitle, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/i18n/locale-provider';
import { useDashboard } from '@/state/dashboard';
import type { TranslationKey } from '@/i18n/messages';
import { toIsoDate } from '@/utils/dates';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import type { StarSku } from '@constella/shared/client';

const GENDER_KEYS: Record<string, TranslationKey> = {
  woman: 'profile.women',
  man: 'profile.men',
  nonbinary: 'profile.nonbinary',
  other: 'profile.other',
};

const errorText = (error: unknown, fallback: string) =>
  error instanceof TRPCClientError && error.message ? error.message : fallback;

type BillingSnapshot = {
  vip: boolean;
  superlikeBalance: number;
  streakFreezes: number;
  boostActiveUntil: string | null;
};

const snapshotOf = (billing: {
  vip: boolean;
  superlikeBalance: number;
  streakFreezes: number;
  boostActiveUntil: Date | string | null;
} | null): BillingSnapshot | null =>
  billing
    ? {
        vip: billing.vip,
        superlikeBalance: billing.superlikeBalance,
        streakFreezes: billing.streakFreezes,
        boostActiveUntil: billing.boostActiveUntil ? String(billing.boostActiveUntil) : null,
      }
    : null;

export default function SkyScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const { me, signOut } = useSession();
  const { billing, quests, loadBilling } = useDashboard();
  const [issue, setIssue] = useState('');
  const [toast, setToast] = useState('');
  const [buying, setBuying] = useState<StarSku | null>(null);
  const [awaiting, setAwaiting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [awaitingLink, setAwaitingLink] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [incognitoBusy, setIncognitoBusy] = useState(false);
  const [passport, setPassport] = useState({ city: '', latitude: '', longitude: '' });
  const [passportBusy, setPassportBusy] = useState(false);
  const snapshot = useRef<BillingSnapshot | null>(null);

  const profile = me?.profile ?? null;
  const vipProduct = billing?.products.find((product) => product.id === 'vip');
  const boostProducts = (billing?.products ?? []).filter((product) => product.kind === 'consumable');

  // Повернення з Telegram не дає клієнтові вебхука: порівнюємо статус зі знімком,
  // зробленим перед створенням рахунку, і зупиняємось, щойно щось змінилось.
  useEffect(() => {
    if (!awaiting || !billing || !snapshot.current) return;
    const before = snapshot.current;
    const after = snapshotOf(billing);
    if (!after) return;
    if (
      after.vip !== before.vip ||
      after.superlikeBalance !== before.superlikeBalance ||
      after.streakFreezes !== before.streakFreezes ||
      after.boostActiveUntil !== before.boostActiveUntil
    ) {
      setAwaiting(false);
      snapshot.current = null;
      setToast(t('sky.paymentConfirmed'));
    }
  }, [awaiting, billing, t]);

  useEffect(() => {
    if (!awaiting) return;
    const timer = setInterval(() => void loadBilling(), 5000);
    return () => clearInterval(timer);
  }, [awaiting, loadBilling]);

  // Мобільний не може скористатися Login Widget, тому прив'язка йде через одноразовий
  // код у бота: API видає код, ми відкриваємо t.me, а підтвердження приходить вебхуком.
  useEffect(() => {
    if (!awaitingLink || !billing?.telegramAvailable) return;
    setAwaitingLink(false);
    setLinking(false);
    setToast(t('sky.telegramLinked'));
  }, [awaitingLink, billing, t]);

  useEffect(() => {
    if (!awaitingLink) return;
    const timer = setInterval(() => void loadBilling(), 5000);
    return () => clearInterval(timer);
  }, [awaitingLink, loadBilling]);

  const linkTelegram = async () => {
    if (linking) return;
    setLinking(true);
    setIssue('');
    setToast('');
    try {
      const result = await trpc.billing.beginTelegramLink.mutate();
      if (result.alreadyLinked) {
        setLinking(false);
        await loadBilling();
        setToast(t('sky.telegramLinked'));
        return;
      }
      if (!result.deepLink) {
        setLinking(false);
        setIssue(t('sky.linkFailed'));
        return;
      }
      await Linking.openURL(result.deepLink);
      setAwaitingLink(true);
      setToast(t('sky.linkOpened'));
    } catch (error) {
      setLinking(false);
      setIssue(errorText(error, t('sky.linkFailed')));
    }
  };

  const buy = async (sku: StarSku) => {
    if (buying || !billing?.telegramAvailable) return;
    setBuying(sku);
    setIssue('');
    setToast('');
    snapshot.current = snapshotOf(billing);
    try {
      const invoice = await trpc.billing.createInvoice.mutate({ sku });
      await Linking.openURL(invoice.invoiceLink);
      setAwaiting(true);
      setToast(t('sky.paymentOpened'));
    } catch (error) {
      snapshot.current = null;
      setIssue(errorText(error, t('dashboard.loadError')));
    } finally {
      setBuying(null);
    }
  };

  const cancelRenewal = async () => {
    setConfirmCancel(false);
    try {
      await trpc.billing.cancelSubscription.mutate();
      await loadBilling();
      setToast(t('sky.renewalCancelled'));
    } catch (error) {
      setIssue(errorText(error, t('dashboard.loadError')));
    }
  };

  const toggleIncognito = async (enabled: boolean) => {
    if (incognitoBusy) return;
    setIncognitoBusy(true);
    setIssue('');
    try {
      await trpc.social.setIncognito.mutate({ enabled });
      await loadBilling();
      setToast(t('sky.saved'));
    } catch (error) {
      setIssue(errorText(error, t('dashboard.loadError')));
    } finally {
      setIncognitoBusy(false);
    }
  };

  const useDeviceLocation = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setIssue(t('profile.locationDenied'));
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const [place] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    setPassport({
      city: place?.city || place?.subregion || passport.city,
      latitude: String(position.coords.latitude),
      longitude: String(position.coords.longitude),
    });
    setIssue('');
  }, [passport.city, t]);

  const applyPassport = async () => {
    setPassportBusy(true);
    setIssue('');
    try {
      await trpc.social.setPassport.mutate({
        city: passport.city.trim(),
        latitude: Number(passport.latitude),
        longitude: Number(passport.longitude),
      });
      await loadBilling();
      setToast(t('sky.saved'));
    } catch (error) {
      setIssue(errorText(error, t('dashboard.loadError')));
    } finally {
      setPassportBusy(false);
    }
  };

  const canPassport =
    Boolean(billing?.vip) &&
    passport.city.trim().length >= 2 &&
    passport.latitude !== '' &&
    passport.longitude !== '';

  return (
    <Screen>
      <View style={styles.topline}>
        <Eyebrow>{t('dashboard.profileEyebrow')}</Eyebrow>
        <LanguageSwitcher />
      </View>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarMark}>{(profile?.city?.slice(0, 1) || 'C').toUpperCase()}</Text>
        </View>
        <View style={styles.identityCopy}>
          <Title>{profile?.displayName || t('dashboard.profile')}</Title>
          <Text style={styles.identityMeta}>
            {`${profile?.city || t('dashboard.noCity')} · ${t('dashboard.level', { level: quests?.level ?? 1 })}`}
          </Text>
        </View>
      </View>

      {issue ? <Notice kind="error">{issue}</Notice> : null}
      {toast ? <Notice kind="status">{toast}</Notice> : null}

      <View style={styles.block}>
        <Eyebrow>{t('dashboard.aboutMe')}</Eyebrow>
        <Text style={styles.body}>{profile?.bio || t('dashboard.addBio')}</Text>
      </View>

      <View style={styles.block}>
        <Eyebrow>{t('dashboard.lookingFor')}</Eyebrow>
        <Text style={styles.body}>
          {profile?.lookingFor?.length
            ? profile.lookingFor.map((value: string) => t(GENDER_KEYS[value] ?? 'profile.other')).join(', ')
            : t('dashboard.notSet')}
        </Text>
      </View>

      {[profile?.promptOne, profile?.promptTwo, profile?.promptThree].filter((value): value is string => Boolean(value))
        .length > 0 ? (
        <View style={styles.block}>
          <Eyebrow>{t('dashboard.prompts')}</Eyebrow>
          {[profile?.promptOne, profile?.promptTwo, profile?.promptThree]
            .filter((value): value is string => Boolean(value))
            .map((prompt, index) => (
              <Text key={`${prompt}-${index}`} style={styles.prompt}>
                {`“${prompt}”`}
              </Text>
            ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('sky.vipTitle', { stars: vipProduct?.stars ?? 0 })}</Text>
        {billing?.vip && billing.entitlement?.expiresAt ? (
          <Text style={styles.cardHint}>
            {t('sky.vipActiveUntil', { date: toIsoDate(billing.entitlement.expiresAt) })}
          </Text>
        ) : (
          <Text style={styles.cardHint}>{t('sky.vipBenefits')}</Text>
        )}
        {billing?.vip && billing.entitlement?.renews === false ? (
          <Text style={styles.cardHint}>{t('sky.renewsOff')}</Text>
        ) : null}
        {billing?.vip && billing.entitlement?.renews ? (
          confirmCancel ? (
            <View style={styles.confirm}>
              <Text style={styles.cardHint}>{t('sky.cancelRenewalConfirm')}</Text>
              <View style={styles.cardActions}>
                <Button label={t('sky.cancelRenewal')} onPress={() => void cancelRenewal()} variant="secondary" />
                <Button label={t('dashboard.cancel')} onPress={() => setConfirmCancel(false)} variant="link" />
              </View>
            </View>
          ) : (
            <Button label={t('sky.cancelRenewal')} onPress={() => setConfirmCancel(true)} variant="link" />
          )
        ) : null}
        {billing?.vip ? (
          <Button label={t('sky.backToOrbit')} onPress={() => router.navigate('/')} variant="secondary" />
        ) : (
          <Button
            busy={buying === 'vip'}
            disabled={!billing?.telegramAvailable}
            label={buying === 'vip' ? t('sky.preparingInvoice') : t('sky.buyStars')}
            onPress={() => void buy('vip')}
          />
        )}
        {!billing?.telegramAvailable ? (
          <View style={styles.cardActions}>
            <Button
              busy={linking}
              label={t('sky.linkTelegram')}
              onPress={() => void linkTelegram()}
              variant="secondary"
            />
            <Button label={t('sky.checkStatus')} onPress={() => void loadBilling()} variant="link" />
          </View>
        ) : null}
        {!billing?.telegramAvailable ? <Text style={styles.cardHint}>{t('sky.telegramHint')}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('sky.boostsTitle')}</Text>
        {boostProducts.map((product) => (
          <View key={product.id} style={styles.productRow}>
            <View style={styles.productCopy}>
              <Text style={styles.productName}>{`${product.title} · ${product.stars} ⭐`}</Text>
              {product.id === 'superlike' ? (
                <Text style={styles.cardHint}>{t('sky.owned', { count: billing?.superlikeBalance ?? 0 })}</Text>
              ) : null}
              {product.id === 'freeze' ? (
                <Text style={styles.cardHint}>{t('sky.owned', { count: billing?.streakFreezes ?? 0 })}</Text>
              ) : null}
            </View>
            <Button
              busy={buying === product.id}
              disabled={!billing?.telegramAvailable}
              label={t('sky.buyStars')}
              onPress={() => void buy(product.id)}
              variant="secondary"
            />
          </View>
        ))}
        {awaiting ? (
          <View style={styles.cardActions}>
            <Text style={styles.cardHint}>{t('sky.paymentOpened')}</Text>
            <Button label={t('sky.checkStatus')} onPress={() => void loadBilling()} variant="link" />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        {billing?.vip ? (
          <Checkbox
            checked={Boolean(billing?.incognito)}
            label={t('sky.incognito')}
            onChange={(next) => void toggleIncognito(next)}
          />
        ) : (
          <Text style={styles.cardTitle}>{t('sky.incognito')}</Text>
        )}
        <Text style={styles.cardHint}>{t('sky.incognitoDesc')}</Text>
        {!billing?.vip ? <Text style={styles.cardHint}>{t('sky.vipOnly')}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('sky.passportTitle')}</Text>
        <Text style={styles.cardHint}>{t('sky.passportHint')}</Text>
        {billing?.passportCity ? (
          <Text style={styles.cardHint}>{`${t('profile.city')}: ${billing.passportCity}`}</Text>
        ) : null}
        {billing?.vip ? (
          <>
            <Field
              label={t('profile.city')}
              onChangeText={(value) => setPassport((prev) => ({ ...prev, city: value }))}
              value={passport.city}
            />
            <Text style={styles.cardHint}>
              {`${t('sky.passportCoords')}: ${passport.latitude || '—'} · ${passport.longitude || '—'}`}
            </Text>
            <View style={styles.cardActions}>
              <Button label={t('profile.useLocation')} onPress={() => void useDeviceLocation()} variant="secondary" />
              <Button
                busy={passportBusy}
                disabled={!canPassport}
                label={t('orbit.filtersApply')}
                onPress={() => void applyPassport()}
              />
            </View>
          </>
        ) : (
          <Text style={styles.cardHint}>{t('sky.vipOnly')}</Text>
        )}
      </View>

      <Button label={t('dashboard.editProfile')} onPress={() => router.push('/profile')} />
      <Button label={t('support.openDesk')} onPress={() => router.push('/support')} variant="secondary" />
      <Button label={t('dashboard.logout')} onPress={() => void signOut()} variant="secondary" />
      <Button label={t('account.deleteAccount')} onPress={() => router.push('/delete')} variant="link" />
      <Button label={t('account.diagnostics')} onPress={() => router.push('/diagnostics')} variant="link" />
      <Subtitle>{t('profile.privacy')}</Subtitle>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mintDim,
  },
  avatarMark: { ...typography.title, color: colors.text, fontSize: 22 },
  identityCopy: { flex: 1, gap: 2 },
  identityMeta: { ...typography.caption, color: colors.mutedSoft },
  block: { gap: spacing.xs },
  body: { ...typography.body, color: colors.textSoft },
  prompt: { ...typography.body, color: colors.mutedSoft, fontStyle: 'italic' },
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardTitle: { ...typography.title, color: colors.goldSoft, fontSize: 17 },
  cardHint: { ...typography.caption, color: colors.mutedSoft, lineHeight: 17 },
  cardActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  confirm: { gap: spacing.sm },
  productRow: { gap: spacing.xs },
  productCopy: { gap: 2 },
  productName: { ...typography.label, color: colors.textSoft, textTransform: 'none', fontSize: 13 },
});
