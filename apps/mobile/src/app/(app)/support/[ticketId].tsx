import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { TRPCClientError } from '@trpc/client';

import { trpc } from '@/api/trpc';
import { Button, Eyebrow, Field, Notice, Screen, Subtitle, Title } from '@/components/ui';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatDateTime } from '@/utils/dates';

const STATUS_KEYS: Record<string, TranslationKey> = {
  open: 'support.statusOpen',
  in_progress: 'support.statusInProgress',
  waiting_user: 'support.statusWaiting',
  resolved: 'support.statusResolved',
  closed: 'support.statusClosed',
};

const errorText = (error: unknown, fallback: string) =>
  error instanceof TRPCClientError && error.message ? error.message : fallback;

type Ticket = Awaited<ReturnType<typeof trpc.support.thread.query>>['ticket'];
type SupportMessage = Awaited<ReturnType<typeof trpc.support.thread.query>>['messages'][number];

export default function SupportThreadScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ ticketId?: string }>();
  const ticketId = params.ticketId ?? '';

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ticketId) return;
    try {
      const result = await trpc.support.thread.query({ ticketId });
      setTicket(result.ticket);
      setMessages(result.messages);
    } catch (error) {
      setIssue(errorText(error, t('support.loadError')));
    }
  }, [ticketId, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const reply = async () => {
    const body = draft.trim();
    if (!ticket || !body || busy) return;
    setBusy(true);
    setIssue('');
    try {
      await trpc.support.reply.mutate({ ticketId: ticket.id, body });
      setDraft('');
      await load();
    } catch (error) {
      setIssue(errorText(error, t('support.replyError')));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!ticket || busy) return;
    setBusy(true);
    setIssue('');
    try {
      await trpc.support.close.mutate({ ticketId: ticket.id });
      await load();
    } catch (error) {
      setIssue(errorText(error, t('support.closeError')));
    } finally {
      setBusy(false);
    }
  };

  const closed = ticket?.status === 'closed';

  return (
    <Screen>
      <Eyebrow>{t('support.eyebrow')}</Eyebrow>
      <Title>{ticket?.subject ?? t('support.myTickets')}</Title>
      <Subtitle>
        {ticket ? `${t(STATUS_KEYS[ticket.status])} · ${ticket.category}` : t('support.subtitle')}
      </Subtitle>

      <View style={styles.thread}>
        {messages.map((message) => (
          <View
            key={message.id}
            style={[styles.bubble, message.authorRole === 'user' ? styles.bubbleMine : styles.bubbleSupport]}
          >
            <Text style={styles.author}>
              {message.authorRole === 'support' ? t('support.team') : t('support.you')} ·{' '}
              {formatDateTime(message.createdAt)}
            </Text>
            <Text style={styles.body}>{message.body}</Text>
          </View>
        ))}
        {!messages.length ? <Text style={styles.muted}>{t('support.none')}</Text> : null}
      </View>

      {issue ? <Notice kind="error">{issue}</Notice> : null}

      {closed ? (
        <Notice kind="status">{t('support.closedNote')}</Notice>
      ) : (
        <>
          <Field
            counter={`${draft.length}/5000`}
            label={t('support.message')}
            multiline
            onChangeText={setDraft}
            placeholder={t('support.replyPlaceholder')}
            value={draft}
          />
          <Button busy={busy} disabled={!draft.trim()} label={t('dashboard.send')} onPress={() => void reply()} />
        </>
      )}

      <View style={styles.actions}>
        <Button variant="secondary" label={t('support.myTickets')} onPress={() => router.back()} />
        {ticket && !closed ? (
          <Button variant="link" disabled={busy} label={t('support.closeTicket')} onPress={() => void close()} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  thread: { gap: spacing.md },
  bubble: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    maxWidth: '94%',
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.mintDim, borderColor: colors.mint },
  bubbleSupport: { alignSelf: 'flex-start' },
  author: { ...typography.caption, color: colors.muted, marginBottom: 4 },
  body: { ...typography.body, color: colors.text },
  muted: { ...typography.body, color: colors.mutedSoft },
  actions: { gap: spacing.xs },
});
