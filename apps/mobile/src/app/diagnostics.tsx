import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { WebLoginSchema, getZodiac } from '@constella/shared/client';

import { probeRuntime } from '@/polyfills';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { registerPushDevice, type PushState } from '@/notifications/push';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const PUSH_LABEL_KEYS: Record<PushState, TranslationKey> = {
  registered: 'account.pushRegistered',
  unsupported: 'account.pushUnsupported',
  denied: 'account.pushDenied',
  error: 'account.pushError',
};

/**
 * Екран-діагностика: доказує, що бандл зібрався, що `@constella/shared/client`
 * резолвиться через Metro, що Hermes-проби (URL, Intl time zone) мають видимий
 * результат і що push-пристрій реально реєструється. Доступний з таба «sky».
 */
export default function DiagnosticsScreen() {
  const { locale, localeNames, supportedLocales, setLocale, t } = useLocale();
  const runtime = probeRuntime();
  const [push, setPush] = useState<PushState | null>(null);
  const [probing, setProbing] = useState(false);
  const apiBase =
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
    'https://api.constella.pp.ua';
  const zodOk = WebLoginSchema.safeParse({ email: 'a@b.io', password: 'x'.repeat(12) }).success;

  const probePush = async () => {
    setProbing(true);
    try {
      setPush(await registerPushDevice());
    } finally {
      setProbing(false);
    }
  };

  const rows: Array<[string, string]> = [
    ['platform', `${Platform.OS} ${Platform.Version}`],
    ['device', Device.isDevice ? 'physical' : 'emulator'],
    ['api base', apiBase],
    ['shared/client', zodOk ? 'ok (zod + URL поліфіл)' : 'FAIL: schema rejected valid login'],
    ['URL', runtime.url ? 'ok' : 'FAIL'],
    ['Intl timeZone', runtime.intlTimeZone ? `ok — ${runtime.detail}` : `FAIL — ${runtime.detail}`],
    ['zodiac probe', getZodiac(new Date('1990-06-15'))],
    ['dictionary', t('app.errorEyebrow')],
    ['push', push ? t(PUSH_LABEL_KEYS[push]) : t('account.pushNotChecked')],
  ];

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>{t('app.errorEyebrow')}</Text>
      <Text style={styles.title}>{t('diagnostics.title')}</Text>
      <Text style={styles.subtitle}>{t('diagnostics.subtitle')}</Text>

      <View style={styles.card}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue} numberOfLines={3}>
              {value}
            </Text>
          </View>
        ))}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('language.label')}</Text>
          <View style={styles.localeRow}>
            {supportedLocales.map((code) => (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityState={{ selected: code === locale }}
                style={[styles.localeChip, code === locale && styles.localeChipActive]}
                onPress={() => setLocale(code)}
              >
                <Text style={styles.localeChipText}>{localeNames[code]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: probing }}
        disabled={probing}
        style={[styles.primary, probing && styles.primaryBusy]}
        onPress={() => void probePush()}
      >
        <Text style={styles.primaryText}>{t('account.pushProbe')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  brand: { ...typography.label, color: colors.gold, letterSpacing: 2.4 },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.muted },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowLabel: { ...typography.label, color: colors.mutedSoft, width: 96, textTransform: 'uppercase' },
  rowValue: { ...typography.body, color: colors.textSoft, flex: 1 },
  localeRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  localeChip: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  localeChipActive: { borderColor: colors.gold, backgroundColor: colors.dangerDim },
  localeChipText: { ...typography.label, color: colors.textSoft },
  primary: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBusy: { opacity: 0.6 },
  primaryText: { ...typography.title, color: colors.bgDeep, fontSize: 16 },
});
