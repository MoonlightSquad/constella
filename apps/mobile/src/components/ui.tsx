import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '@/theme/tokens';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.subtitle, style]}>{children}</Text>;
}

export function Field({
  label,
  hint,
  counter,
  style,
  ...inputProps
}: TextInputProps & { label: string; hint?: string; counter?: string }) {
  return (
    <View style={[styles.field, style]}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {counter ? <Text style={styles.fieldHint}>{counter}</Text> : null}
      </View>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.muted}
        style={[styles.fieldInput, inputProps.multiline && styles.fieldTextArea]}
        autoCapitalize={inputProps.autoCapitalize ?? 'none'}
        accessibilityLabel={label}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.chipPressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Section({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitle}>
        <Text style={styles.sectionIndex}>{index}</Text>
        <Text style={styles.sectionHeading}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'telegram' | 'link';
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', busy, disabled, testID, style }: ButtonProps) {
  const blocked = Boolean(busy) || Boolean(disabled);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: Boolean(busy) }}
      testID={testID}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && styles.buttonPressed,
        blocked && styles.buttonDisabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colors.bgDeep : colors.text} />
      ) : (
        <Text style={[styles.buttonText, styles[`${variant}Text`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'status'; children: ReactNode }) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.notice, kind === 'error' ? styles.noticeError : styles.noticeStatus]}
    >
      {children}
    </Text>
  );
}

/** Помилка завантаження + єдиний спосіб повторити запит (матриця retry-поведінок). */
export function LoadIssue({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.loadIssue}>
      <Notice kind="error">{message}</Notice>
      <Button label={retryLabel} onPress={onRetry} variant="link" />
    </View>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={styles.checkbox}
      onPress={() => onChange(!checked)}
    >
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  eyebrow: { ...typography.label, color: colors.mintSoft, letterSpacing: 1.4 },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.mutedSoft, marginTop: -spacing.sm },
  field: { gap: spacing.sm },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textSoft, textTransform: 'uppercase' },
  fieldInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  fieldTextArea: { minHeight: 84 },
  fieldHint: { ...typography.caption, color: colors.muted },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: { borderColor: colors.mint, backgroundColor: colors.mintDim },
  chipPressed: { opacity: 0.8 },
  chipText: { ...typography.caption, color: colors.textSoft, fontSize: 13 },
  chipTextSelected: { color: colors.text, fontWeight: '700' },
  section: { gap: spacing.md },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionIndex: { ...typography.label, color: colors.gold },
  sectionHeading: { ...typography.title, color: colors.text, fontSize: 18 },
  button: {
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { ...typography.title, fontSize: 15, fontWeight: '700' },
  primary: { backgroundColor: colors.goldDeep },
  primaryText: { color: colors.surfaceRaised },
  secondary: { backgroundColor: colors.mintDim, borderWidth: 1, borderColor: colors.mint },
  secondaryText: { color: colors.textSoft },
  telegram: { backgroundColor: '#2b7f9f' },
  telegramText: { color: '#ffffff' },
  link: { backgroundColor: 'transparent', minHeight: 44 },
  linkText: { color: colors.mintSoft, fontSize: 13, fontWeight: '600' },
  notice: { ...typography.body, fontSize: 13, lineHeight: 19 },
  noticeError: { color: colors.dangerSoft },
  noticeStatus: { color: colors.mintSoft },
  loadIssue: { gap: 2 },
  checkbox: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flex: 0,
  },
  checkboxBoxChecked: { backgroundColor: colors.mint },
  checkboxMark: { color: colors.bgDeep, fontSize: 13, lineHeight: 16, fontWeight: '800' },
  checkboxLabel: { ...typography.caption, flex: 1, color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' },
});
