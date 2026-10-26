import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { TRPCClientError } from '@trpc/client';

import { trpc } from '@/api/trpc';
import type { PublicProfile } from '@/api/types';
import { Button, Chip, Eyebrow, Field, Notice, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SafetySheet, type SafetyTarget } from '@/components/safety-sheet';
import { SwipeCard, type SwipeKind } from '@/components/swipe-card';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { useDashboard } from '@/state/dashboard';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useReducedMotion } from '@/utils/motion';

const GENDERS: { value: GenderValue; label: TranslationKey }[] = [
  { value: 'woman', label: 'profile.women' },
  { value: 'man', label: 'profile.men' },
  { value: 'nonbinary', label: 'profile.nonbinary' },
  { value: 'other', label: 'profile.other' },
];

type GenderValue = 'woman' | 'man' | 'nonbinary' | 'other';
type OrbitFilters = Exclude<Parameters<typeof trpc.social.orbit.query>[0], void>;
type Draft = { minAge: string; maxAge: string; city: string; gender: '' | GenderValue };

const emptyDraft: Draft = { minAge: '', maxAge: '', city: '', gender: '' };

const messageFrom = (error: unknown, fallback: string) =>
  error instanceof TRPCClientError && error.message ? error.message : fallback;

export default function OrbitScreen() {
  const { t } = useLocale();
  const { billing, loadMatches, loadSparks } = useDashboard();
  const [deck, setDeck] = useState<PublicProfile[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [releasePending, setReleasePending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const [toast, setToast] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filters, setFilters] = useState<OrbitFilters>({});
  const [safety, setSafety] = useState<SafetyTarget | null>(null);
  const reducedMotion = useReducedMotion();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadOrbit = useCallback(async () => {
    setLoading(true);
    setIssue('');
    try {
      const result = await trpc.social.orbit.query(filters);
      setDeck(result.profiles as PublicProfile[]);
      setRemaining(result.remaining);
      setReleasePending(result.releasePending);
    } catch (error) {
      setIssue(messageFrom(error, t('dashboard.loadError')));
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  useFocusEffect(
    useCallback(() => {
      void loadOrbit();
    }, [loadOrbit]),
  );

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const flash = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3600);
  };

  const current = deck[0] ?? null;

  const react = async (kind: SwipeKind) => {
    if (!current || busy) return;
    setBusy(true);
    setIssue('');
    try {
      const result = await trpc.social.swipe.mutate({ profileId: current.id, kind });
      await loadOrbit();
      if (result.matched) {
        flash(t('dashboard.matchToast'));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        await Promise.all([loadMatches(), loadSparks()]);
      }
    } catch (error) {
      setIssue(messageFrom(error, t('dashboard.loadError')));
    } finally {
      setBusy(false);
    }
  };

  const applyFilters = () => {
    const next: OrbitFilters = {};
    if (draft.minAge.trim()) next.minAge = Number(draft.minAge);
    if (draft.maxAge.trim()) next.maxAge = Number(draft.maxAge);
    if (draft.city.trim()) next.city = draft.city.trim();
    if (draft.gender) next.gender = draft.gender;
    setFilters(next);
  };

  const resetFilters = () => {
    setDraft(emptyDraft);
    setFilters({});
  };

  const hasFilters = useMemo(() => Object.keys(filters).length > 0, [filters]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.shell}>
      <View style={styles.head}>
        <View style={styles.topline}>
          <Eyebrow>{t('dashboard.orbitEyebrow')}</Eyebrow>
          <LanguageSwitcher />
        </View>
        <View style={styles.heading}>
          <Title>{t('dashboard.orbitTitle')}</Title>
          <Text style={styles.counter}>{`${remaining} / 8`}</Text>
        </View>
        {issue ? <Notice kind="error">{issue}</Notice> : null}
        {toast ? <Notice kind="status">{toast}</Notice> : null}

        {billing?.vip ? (
          <View style={styles.filters}>
            <View style={styles.filtersHeading}>
              <Text style={styles.filtersTitle}>{t('orbit.filtersTitle')}</Text>
              <Text style={styles.filtersHint}>{t('orbit.filtersHint')}</Text>
            </View>
            <View style={styles.filtersRow}>
              <Field
                label={t('orbit.ageFrom')}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={(value) => setDraft((prev) => ({ ...prev, minAge: value }))}
                style={styles.flexField}
                value={draft.minAge}
              />
              <Field
                label={t('orbit.ageTo')}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={(value) => setDraft((prev) => ({ ...prev, maxAge: value }))}
                style={styles.flexField}
                value={draft.maxAge}
              />
            </View>
            <Field
              label={t('profile.city')}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, city: value }))}
              placeholder={t('orbit.cityAny')}
              value={draft.city}
            />
            <View style={styles.chips}>
              <Chip label={t('orbit.genderAny')} selected={!draft.gender} onPress={() => setDraft((prev) => ({ ...prev, gender: '' }))} />
              {GENDERS.map((option) => (
                <Chip
                  key={option.value}
                  label={t(option.label)}
                  selected={draft.gender === option.value}
                  onPress={() => setDraft((prev) => ({ ...prev, gender: option.value }))}
                />
              ))}
            </View>
            <View style={styles.filtersActions}>
              <Button label={t('orbit.filtersApply')} onPress={applyFilters} variant="secondary" />
              {hasFilters ? <Button label={t('orbit.filtersReset')} onPress={resetFilters} variant="link" /> : null}
            </View>
          </View>
        ) : (
          <View style={styles.locked}>
            <Text style={styles.lockedText}>{t('orbit.filtersLocked')}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('dashboard.loadingOrbit')}</Text>
        </View>
      ) : current ? (
        <View style={styles.deck}>
          <SwipeCard disabled={busy} key={current.id} onSwipe={(kind) => void react(kind)} resetKey={current.id}>
            <View style={styles.photo}>
              {current.photos[0] ? (
                <Image
                  accessibilityLabel={t('dashboard.verifiedProfile')}
                  contentFit="cover"
                  source={{ uri: current.photos[0] }}
                  style={StyleSheet.absoluteFill}
                  transition={reducedMotion ? null : 160}
                />
              ) : (
                <Text style={styles.photoMark}>✦</Text>
              )}
              <View style={styles.photoLabel}>
                <Text style={styles.photoCity}>{current.city || t('dashboard.noCity')}</Text>
                {current.distanceKm != null ? <Text style={styles.photoDistance}>{`${current.distanceKm} km`}</Text> : null}
                {current.verified ? <Text style={styles.photoVerified}>{t('dashboard.verified')}</Text> : null}
              </View>
            </View>
            <View style={styles.copy}>
              <Text style={styles.name}>{`${current.displayName}, ${current.age}`}</Text>
              <ScrollView contentContainerStyle={styles.copyScroll} showsVerticalScrollIndicator={false}>
                {current.bio ? <Text style={styles.bio}>{current.bio}</Text> : null}
                {current.prompts.map((prompt, index) => (
                  <Text key={`${prompt}-${index}`} style={styles.prompt}>
                    {`“${prompt}”`}
                  </Text>
                ))}
              </ScrollView>
            </View>
          </SwipeCard>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyStar}>✦</Text>
          <Text style={styles.emptyTitle}>{t(releasePending ? 'dashboard.releasePending' : 'dashboard.emptyOrbit')}</Text>
          <Text style={styles.emptyText}>
            {t(releasePending ? 'dashboard.releaseDescription' : 'dashboard.emptyOrbitDescription')}
          </Text>
          {releasePending ? null : <Button variant="secondary" label={t('dashboard.refreshOrbit')} onPress={() => void loadOrbit()} />}
        </View>
      )}

      {current ? (
        <View style={styles.foot}>
          <View style={styles.actions}>
            <Button
              label={t('dashboard.pass')}
              onPress={() => void react('pass')}
              variant="secondary"
              busy={busy}
              style={styles.flexButton}
            />
            <Button
              label={`✦ ${t('dashboard.sendSpark')}`}
              onPress={() => void react('spark')}
              busy={busy}
              style={styles.flexButton}
            />
            <Button
              label={`★ ${billing?.superlikeBalance ?? 0}`}
              onPress={() => void react('super')}
              variant="telegram"
              busy={busy}
              style={styles.flexButton}
            />
          </View>
          <View style={styles.safety}>
            <Button
              label={t('dashboard.reportShort')}
              onPress={() => setSafety({ action: 'report', label: current.displayName, profileId: current.id })}
              variant="link"
            />
            <Button
              label={t('dashboard.blockShort')}
              onPress={() => setSafety({ action: 'block', label: current.displayName, profileId: current.id })}
              variant="link"
            />
          </View>
          <Text style={styles.caption}>{t('orbit.superlikes', { count: billing?.superlikeBalance ?? 0 })}</Text>
          <Text style={styles.caption}>{t('dashboard.dailyLimit')}</Text>
        </View>
      ) : null}

      <SafetySheet
        onClose={() => setSafety(null)}
        onSuccess={(action) => {
          flash(t(action === 'block' ? 'dashboard.blocked' : 'dashboard.reportThanks'));
          void loadOrbit();
        }}
        target={safety}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  head: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  counter: { ...typography.title, color: colors.gold, fontSize: 17 },
  filters: { gap: spacing.sm },
  filtersHeading: { gap: 2 },
  filtersTitle: { ...typography.label, color: colors.gold },
  filtersHint: { ...typography.caption, color: colors.muted },
  filtersRow: { flexDirection: 'row', gap: spacing.sm },
  flexField: { flex: 1 },
  flexButton: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filtersActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  locked: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  lockedText: { ...typography.caption, color: colors.mutedSoft },
  deck: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  photo: { flex: 1.25, backgroundColor: colors.bgDeep, alignItems: 'center', justifyContent: 'center' },
  photoMark: { fontSize: 42, color: colors.goldDim },
  photoLabel: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  photoCity: { ...typography.label, color: colors.text, textTransform: 'none', fontSize: 13 },
  photoDistance: { ...typography.caption, color: colors.mintSoft },
  photoVerified: {
    ...typography.caption,
    color: colors.bgDeep,
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    fontWeight: '700',
  },
  copy: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  name: { ...typography.title, color: colors.text },
  copyScroll: { gap: spacing.sm, paddingBottom: spacing.md },
  bio: { ...typography.body, color: colors.textSoft },
  prompt: { ...typography.body, color: colors.mutedSoft, fontStyle: 'italic' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyStar: { fontSize: 34, color: colors.goldDim },
  emptyTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  emptyText: { ...typography.body, color: colors.mutedSoft, textAlign: 'center' },
  foot: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  safety: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  caption: { ...typography.caption, color: colors.muted, textAlign: 'center' },
});
