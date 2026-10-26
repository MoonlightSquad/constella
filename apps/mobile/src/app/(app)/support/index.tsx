import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { TRPCClientError } from '@trpc/client';

import { trpc } from '@/api/trpc';
import { Button, Chip, Eyebrow, Field, Notice, Screen, Subtitle, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatDateTime } from '@/utils/dates';

type Category = 'general' | 'account' | 'billing' | 'safety' | 'technical';

const STATUS_KEYS: Record<string, TranslationKey> = {
  open: 'support.statusOpen',
  in_progress: 'support.statusInProgress',
  waiting_user: 'support.statusWaiting',
  resolved: 'support.statusResolved',
  closed: 'support.statusClosed',
};

const CATEGORY_KEYS: Record<Category, TranslationKey> = {
  general: 'support.catGeneral',
  account: 'support.catAccount',
  billing: 'support.catBilling',
  safety: 'support.catSafety',
  technical: 'support.catTechnical',
};

const CATEGORY_LABELS = Object.entries(CATEGORY_KEYS) as [Category, TranslationKey][];

const errorText = (error: unknown, fallback: string) =>
  error instanceof TRPCClientError && error.message ? error.message : fallback;

type Ticket = Awaited<ReturnType<typeof trpc.support.mine.query>>[number];

export default function SupportScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<Category>('general');
  const [issue, setIssue] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setTickets(await trpc.support.mine.query());
    } catch (error) {
      setIssue(errorText(error, t('support.loadError')));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setIssue('');
    try {
      const ticket = await trpc.support.create.mutate({
        subject: subject.trim(),
        category,
        message: message.trim(),
      });
      setSubject('');
      setMessage('');
      await load();
      router.push(`/support/${ticket.id}`);
    } catch (error) {
      setIssue(errorText(error, t('support.createError')));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen>
      <Eyebrow>{t('support.eyebrow')}</Eyebrow>
      <Title>{t('support.title')}</Title>
      <Subtitle>{t('support.subtitle')}</Subtitle>
      <View style={styles.topline}>
        <Text style={styles.listHeading}>{t('support.myTickets')}</Text>
        <LanguageSwitcher />
      </View>

      {tickets.length ? (
        tickets.map((ticket) => (
          <Pressable
            accessibilityRole="button"
            key={ticket.id}
            onPress={() => router.push(`/support/${ticket.id}`)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowCopy}>
              <Text numberOfLines={1} style={styles.rowTitle}>
                {ticket.subject}
              </Text>
              <Text style={styles.rowMeta}>
                {t(STATUS_KEYS[ticket.status])} · {formatDateTime(ticket.updatedAt)}
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))
      ) : (
        <Text style={styles.muted}>{t('support.none')}</Text>
      )}

      <View style={styles.form}>
        <Text style={styles.listHeading}>{t('support.newTitle')}</Text>
        <Field
          counter={`${subject.length}/120`}
          label={t('support.subject')}
          maxLength={120}
          onChangeText={setSubject}
          placeholder={t('support.subjectHint')}
          value={subject}
        />
        <Text style={styles.fieldLabel}>{t('support.category')}</Text>
        <View style={styles.chips}>
          {CATEGORY_LABELS.map(([value, key]) => (
            <Chip
              key={value}
              label={t(key)}
              onPress={() => setCategory(value)}
              selected={category === value}
            />
          ))}
        </View>
        <Field
          counter={`${message.length}/5000`}
          label={t('support.message')}
          multiline
          onChangeText={setMessage}
          placeholder={t('support.messageHint')}
          value={message}
        />
        {issue ? <Notice kind="error">{issue}</Notice> : null}
        <Button
          busy={creating}
          disabled={subject.trim().length < 5 || message.trim().length === 0}
          label={creating ? t('support.creating') : t('support.create')}
          onPress={() => void create()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  listHeading: { ...typography.title, color: colors.text, fontSize: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  rowPressed: { borderColor: colors.borderStrong, opacity: 0.9 },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { ...typography.title, color: colors.text, fontSize: 15 },
  rowMeta: { ...typography.caption, color: colors.mutedSoft },
  arrow: { color: colors.goldDim, fontSize: 20 },
  muted: { ...typography.body, color: colors.mutedSoft },
  form: { gap: spacing.md },
  fieldLabel: { ...typography.label, color: colors.textSoft, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
