import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '@/i18n/locale-provider';
import { colors, radius, spacing, typography } from '@/theme/tokens';

/** Паритет `apps/web/components/LanguageSwitcher.vue` — 4 мови, без auto-редиректів. */
export function LanguageSwitcher() {
  const { locale, localeNames, supportedLocales, setLocale } = useLocale();
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {supportedLocales.map((code) => (
        <Pressable
          key={code}
          accessibilityRole="button"
          accessibilityState={{ selected: code === locale }}
          onPress={() => setLocale(code)}
          style={[styles.chip, code === locale && styles.chipActive]}
        >
          <Text style={[styles.label, code === locale && styles.labelActive]}>
            {localeNames[code].slice(0, 3).toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: spacing.xs },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.gold },
  label: { ...typography.label, color: colors.mutedSoft, letterSpacing: 0.5 },
  labelActive: { color: colors.gold },
});
