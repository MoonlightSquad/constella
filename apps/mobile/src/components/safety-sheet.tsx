import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { trpc } from '@/api/trpc';
import { Button, Chip, Eyebrow, Field, Notice, Title } from '@/components/ui';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export type SafetyTarget = {
  profileId: string;
  label: string;
  matchId?: string;
  action: 'report' | 'block';
};

const REASONS: { value: 'spam' | 'harassment' | 'fake_profile' | 'underage' | 'other'; label: TranslationKey }[] = [
  { value: 'spam', label: 'dashboard.reasonSpam' },
  { value: 'harassment', label: 'dashboard.reasonHarassment' },
  { value: 'fake_profile', label: 'dashboard.reasonFake' },
  { value: 'underage', label: 'dashboard.reasonUnderage' },
  { value: 'other', label: 'dashboard.reasonOther' },
];

/** Паритет report-діалогу та блоку з `ConstellaDashboard.vue:1200-1222`. */
export function SafetySheet({
  target,
  onClose,
  onSuccess,
}: {
  target: SafetyTarget | null;
  onClose: () => void;
  onSuccess: (action: SafetyTarget['action']) => void;
}) {
  const { t } = useLocale();
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');

  const close = () => {
    setReason('spam');
    setDetails('');
    setBusy(false);
    setIssue('');
    onClose();
  };

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    setIssue('');
    try {
      if (target.action === 'block') {
        await trpc.social.blockProfile.mutate({ profileId: target.profileId });
      } else {
        await trpc.social.reportProfile.mutate({
          profileId: target.profileId,
          ...(target.matchId ? { matchId: target.matchId } : {}),
          reason,
          ...(details.trim() ? { details: details.trim() } : {}),
        });
      }
      onSuccess(target.action);
      close();
    } catch (error) {
      setIssue(error instanceof Error ? error.message : t('dashboard.loadError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible={Boolean(target)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {target?.action === 'block' ? (
            <>
              <Eyebrow>{t('dashboard.reportEyebrow')}</Eyebrow>
              <Title>{target.label}</Title>
              <Text style={styles.body}>{t('dashboard.blockConfirm')}</Text>
              {issue ? <Notice kind="error">{issue}</Notice> : null}
              <Button busy={busy} label={t('dashboard.block')} onPress={() => void submit()} />
              <Button variant="link" label={t('dashboard.cancel')} onPress={close} />
            </>
          ) : (
            <>
              <Eyebrow>{t('dashboard.reportEyebrow')}</Eyebrow>
              <Title>{t('dashboard.reportTitle', { name: target?.label ?? '' })}</Title>
              <View style={styles.reasons}>
                <Text style={styles.reasonLabel}>{t('dashboard.reportReason')}</Text>
                <View style={styles.chips}>
                  {REASONS.map((option) => (
                    <Chip
                      key={option.value}
                      disabled={busy}
                      label={t(option.label)}
                      selected={reason === option.value}
                      onPress={() => setReason(option.value)}
                    />
                  ))}
                </View>
              </View>
              <Field
                counter={`${details.length}/500`}
                label={t('dashboard.reportDetails')}
                multiline
                numberOfLines={3}
                onChangeText={setDetails}
                placeholder={t('dashboard.reportPlaceholder')}
                value={details}
              />
              {issue ? <Notice kind="error">{issue}</Notice> : null}
              <Button busy={busy} label={t('dashboard.sendReport')} onPress={() => void submit()} />
              <Button variant="link" label={t('dashboard.cancel')} onPress={close} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#04090a99',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  sheet: {
    gap: spacing.md,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  body: { ...typography.body, color: colors.textSoft },
  reasons: { gap: spacing.sm },
  reasonLabel: { ...typography.label, color: colors.textSoft, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
