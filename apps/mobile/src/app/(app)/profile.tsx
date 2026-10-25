import { useMemo, useState } from 'react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { TRPCClientError } from '@trpc/client';

import { trpc } from '@/api/trpc';
import { useSession } from '@/auth/session';
import { Button, Checkbox, Chip, Eyebrow, Field, Notice, Screen, Section, Subtitle, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PhotoGrid } from '@/components/photo-grid';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { ageOn, deviceTimeZone, latestBirthdate, toIsoDate } from '@/utils/dates';
import { ProfileOnboardingSchema } from '@constella/shared/client';
import { colors, spacing, typography } from '@/theme/tokens';

const GENDERS = ['woman', 'man', 'nonbinary', 'other'] as const;
const GENDER_KEYS: Record<(typeof GENDERS)[number], TranslationKey> = {
  woman: 'profile.women',
  man: 'profile.men',
  nonbinary: 'profile.nonbinary',
  other: 'profile.other',
};

const FIELD_KEYS: Record<string, TranslationKey> = {
  displayName: 'profile.name',
  birthdate: 'profile.birthdate',
  gender: 'profile.gender',
  lookingFor: 'profile.requiredLookingFor',
  city: 'profile.city',
  radiusKm: 'profile.radius',
  photos: 'profile.requiredPhoto',
};

type FormState = {
  birthdate: string;
  displayName: string;
  gender: string;
  lookingFor: string[];
  city: string;
  bio: string;
  radiusKm: number;
  promptOne: string;
  promptTwo: string;
  promptThree: string;
  photos: string[];
  latitude: number | null;
  longitude: number | null;
};

type MeProfile = NonNullable<Awaited<ReturnType<typeof trpc.me.query>>['profile']>;

const initialForm = (profile: MeProfile | null): FormState => ({
  birthdate: toIsoDate(profile?.birthdate ?? ''),
  displayName: profile?.displayName ?? '',
  gender: GENDERS.includes(profile?.gender as (typeof GENDERS)[number]) ? (profile?.gender as string) : 'woman',
  lookingFor: profile?.lookingFor?.length ? [...profile.lookingFor] : ['man'],
  city: profile?.city ?? '',
  bio: profile?.bio ?? '',
  radiusKm: profile?.preferredRadiusKm ?? 50,
  promptOne: profile?.promptOne ?? '',
  promptTwo: profile?.promptTwo ?? '',
  promptThree: profile?.promptThree ?? '',
  photos: profile?.photos ?? [],
  latitude: null,
  longitude: null,
});

export default function ProfileScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const { me, refresh } = useSession();
  const [form, setForm] = useState<FormState>(() => initialForm(me?.profile ?? null));
  const [acceptedTerms, setAcceptedTerms] = useState(Boolean(me?.onboardingComplete));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<{ label: string } | null>(null);

  const editing = Boolean(me?.onboardingComplete);
  const birthDate = useMemo(() => (form.birthdate ? new Date(`${form.birthdate}T00:00:00Z`) : latestBirthdate()), [form.birthdate]);

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }));

  const toggleLookingFor = (value: string) => {
    setForm((current) => ({
      ...current,
      lookingFor: current.lookingFor.includes(value)
        ? current.lookingFor.filter((item) => item !== value)
        : [...current.lookingFor, value],
    }));
  };

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError({ label: t('profile.locationDenied') });
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      patch({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        city: form.city || place?.city || place?.subregion || '',
      });
    } catch {
      // Без координат Orbit працює на місті; саме тому помилка не блокує збереження.
      setError({ label: t('profile.locationDenied') });
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    setError(null);

    if (!form.lookingFor.length) {
      setError({ label: t('profile.requiredLookingFor') });
      return;
    }
    if (!form.photos.length) {
      setError({ label: t('profile.requiredPhoto') });
      return;
    }
    if (ageOn(form.birthdate) < 18) {
      setError({ label: t('profile.tooYoung') });
      return;
    }

    const candidate = {
      birthdate: form.birthdate,
      displayName: form.displayName.trim(),
      gender: form.gender,
      lookingFor: form.lookingFor,
      city: form.city.trim(),
      timeZone: deviceTimeZone(),
      acceptedTerms,
      bio: form.bio.trim(),
      radiusKm: Number(form.radiusKm),
      promptOne: form.promptOne.trim(),
      promptTwo: form.promptTwo.trim(),
      promptThree: form.promptThree.trim(),
      photos: form.photos,
      ...(form.latitude != null && form.longitude != null
        ? { latitude: form.latitude, longitude: form.longitude }
        : {}),
    };

    const parsed = ProfileOnboardingSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const key = issue?.path[0];
      const label = typeof key === 'string' && FIELD_KEYS[key] ? t(FIELD_KEYS[key]) : t('profile.invalid');
      setError({ label: `${label}: ${issue?.message ?? ''}` });
      return;
    }

    setBusy(true);
    try {
      await trpc.completeProfile.mutate(parsed.data);
      await refresh();
      router.replace('/');
    } catch (cause) {
      setError({
        label: cause instanceof TRPCClientError ? cause.message : t('app.saveFailed'),
      });
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topline}>
        <Eyebrow>{t('profile.eyebrow')}</Eyebrow>
        <LanguageSwitcher />
      </View>

      <Title>{t(editing ? 'profile.titleEdit' : 'profile.titleNew')}</Title>
      <Subtitle>{t('profile.subtitle')}</Subtitle>

      <Section index="01" title={t('profile.about')}>
        <Field
          label={`${t('profile.name')} · ${t('profile.required')}`}
          value={form.displayName}
          onChangeText={(value) => patch({ displayName: value })}
          maxLength={40}
          autoComplete="name"
          autoCapitalize="words"
        />

        <PressableDate
          label={`${t('profile.birthdate')} · ${t('profile.age18')}`}
          value={form.birthdate}
          onChange={(value) => patch({ birthdate: value })}
        />

        <Text style={styles.groupLabel}>{`${t('profile.gender')} · ${t('profile.required')}`}</Text>
        <View style={styles.chips}>
          {GENDERS.map((value) => (
            <Chip
              key={value}
              label={t(GENDER_KEYS[value])}
              selected={form.gender === value}
              onPress={() => patch({ gender: value })}
            />
          ))}
        </View>

        <Text style={styles.groupLabel}>{`${t('profile.lookingFor')} · ${t('profile.required')}`}</Text>
        <View style={styles.chips}>
          {GENDERS.map((value) => (
            <Chip
              key={value}
              label={t(GENDER_KEYS[value])}
              selected={form.lookingFor.includes(value)}
              disabled={!form.lookingFor.includes(value) && form.lookingFor.length >= 3}
              onPress={() => toggleLookingFor(value)}
            />
          ))}
        </View>

        <Field
          label={`${t('profile.city')} · ${t('profile.required')}`}
          value={form.city}
          onChangeText={(value) => patch({ city: value })}
          placeholder={t('profile.cityPlaceholder')}
          maxLength={80}
          autoCapitalize="words"
        />
        <Button
          variant="link"
          label={t('profile.useLocation')}
          onPress={() => void locate()}
          busy={locating}
        />

        <View style={styles.field}>
          <Text style={styles.groupLabel}>
            {`${t('profile.radius')} · ${form.radiusKm} km`}
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={10}
            maximumValue={250}
            step={10}
            value={form.radiusKm}
            onValueChange={(value) => patch({ radiusKm: value })}
            minimumTrackTintColor={colors.mint}
            maximumTrackTintColor={colors.borderStrong}
            thumbTintColor={colors.gold}
            accessibilityLabel={t('profile.radius')}
          />
        </View>
      </Section>

      <Section index="02" title={t('profile.story')}>
        <Field
          label={t('profile.bio')}
          value={form.bio}
          onChangeText={(value) => patch({ bio: value })}
          placeholder={t('profile.bioPlaceholder')}
          maxLength={500}
          multiline
          numberOfLines={3}
          counter={`${form.bio.length}/500`}
        />
        <Field
          label={t('profile.idealEvening')}
          value={form.promptOne}
          onChangeText={(value) => patch({ promptOne: value })}
          placeholder={t('profile.idealEveningPlaceholder')}
          maxLength={180}
          multiline
          numberOfLines={2}
        />
        <Field
          label={t('profile.smallJoy')}
          value={form.promptTwo}
          onChangeText={(value) => patch({ promptTwo: value })}
          placeholder={t('profile.smallJoyPlaceholder')}
          maxLength={180}
          multiline
          numberOfLines={2}
        />
        <Field
          label={t('profile.talkAbout')}
          value={form.promptThree}
          onChangeText={(value) => patch({ promptThree: value })}
          placeholder={t('profile.talkPlaceholder')}
          maxLength={180}
          multiline
          numberOfLines={2}
        />
      </Section>

      <Checkbox label={t('profile.consent')} checked={acceptedTerms} onChange={setAcceptedTerms} />

      <Section index="03" title={`${t('profile.photos')} · ${t('profile.required')}`}>
        <PhotoGrid value={form.photos} onChange={(photos) => patch({ photos })} />
      </Section>

      {error ? <Notice kind="error">{error.label}</Notice> : null}

      <Button
        label={t(busy ? 'profile.saving' : editing ? 'profile.save' : 'profile.openOrbit')}
        onPress={() => void submit()}
        busy={busy}
      />
      {editing ? <Button variant="link" label={t('profile.cancel')} onPress={() => router.back()} /> : null}
      <Subtitle>{t('profile.privacy')}</Subtitle>
    </Screen>
  );
}

function PressableDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : new Date();

  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: selected,
        mode: 'date',
        maximumDate: latestBirthdate(),
        onChange: (_event, date) => {
          if (date) onChange(toIsoDate(date));
        },
      });
      return;
    }
    setOpen((current) => !current);
  };

  return (
    <View style={styles.field}>
      <Button variant="secondary" label={value ? `${label}: ${value}` : label} onPress={show} />
      {open ? (
        <DateTimePicker
          value={selected}
          mode="date"
          maximumDate={latestBirthdate()}
          onChange={(_event, date) => {
            setOpen(false);
            if (date) onChange(toIsoDate(date));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  field: { gap: spacing.sm },
  groupLabel: { ...typography.label, color: colors.textSoft, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slider: { width: '100%', height: 44 },
});
