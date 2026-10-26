import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Eyebrow, Notice, Screen, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { useDashboard } from '@/state/dashboard';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatTime } from '@/utils/dates';

/** Прев'ю останнього повідомлення — той самий розбір `kind`, що в бульбашках чату. */
const previewKey = (kind: string | null | undefined): TranslationKey | null => {
  if (kind === 'voice') return 'dashboard.voiceMessage';
  if (kind === 'image') return 'chats.lastImage';
  if (kind === 'video') return 'chats.lastVideo';
  if (kind === 'contact') return 'chats.lastContact';
  if (kind === 'call') return 'chats.lastCall';
  return null;
};

export default function ChatsScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const { matches, loading, issue, loadMatches, refreshAll } = useDashboard();

  useFocusEffect(
    useCallback(() => {
      void loadMatches();
    }, [loadMatches]),
  );

  return (
    <Screen>
      <View style={styles.topline}>
        <Eyebrow>{t('dashboard.mutualEyebrow')}</Eyebrow>
        <LanguageSwitcher />
      </View>
      <View style={styles.heading}>
        <Title>{t('dashboard.chats')}</Title>
        <Text style={styles.counter}>{String(matches.length)}</Text>
      </View>
      {issue ? <Notice kind="error">{issue}</Notice> : null}

      {loading && !matches.length ? (
        <Text style={styles.empty}>{t('dashboard.loadingChats')}</Text>
      ) : matches.length ? (
        matches.map((match) => {
          const kind = match.lastMessage?.kind ?? null;
          const label = previewKey(kind);
          const body = label ? t(label) : (match.lastMessage?.body ?? '');
          const preview = match.lastMessage
            ? `${match.lastMessage.sentByMe ? `${t('dashboard.you')} ` : ''}${body}`
            : t('dashboard.matchStart');
          return (
            <Pressable
              accessibilityLabel={`${match.profile?.displayName ?? t('dashboard.newMatch')}. ${preview}`}
              accessibilityRole="button"
              key={match.id}
              onPress={() => router.push(`/chat/${match.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              {match.profile?.photos[0] ? (
                <Image
                  accessibilityLabel={t('dashboard.verifiedProfile')}
                  contentFit="cover"
                  source={{ uri: match.profile.photos[0] }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarMark}>✦</Text>
                </View>
              )}
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={1} style={styles.name}>
                    {match.profile?.displayName || t('dashboard.newMatch')}
                  </Text>
                  <Text style={styles.time}>
                    {formatTime(match.lastMessage?.createdAt ?? match.createdAt)}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.preview}>
                  {preview}
                </Text>
              </View>
              {match.unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {match.unread > 99 ? '99+' : String(match.unread)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.arrow}>›</Text>
              )}
            </Pressable>
          );
        })
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.mark}>♡</Text>
          <Text style={styles.emptyTitle}>{t('dashboard.noMatches')}</Text>
          <Text style={styles.emptyHint}>{t('dashboard.noMatchesHint')}</Text>
          <Button label={t('dashboard.backOrbit')} onPress={() => router.navigate('/')} variant="secondary" />
          <Button label={t('dashboard.refreshOrbit')} onPress={() => void refreshAll()} variant="link" />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  counter: { ...typography.display, color: colors.gold, fontSize: 26 },
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
  avatar: { width: 46, height: 46, borderRadius: radius.pill, backgroundColor: colors.bgDeep },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgDeep,
  },
  avatarMark: { color: colors.goldDim, fontSize: 18 },
  copy: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { ...typography.title, color: colors.text, fontSize: 16, flex: 1 },
  time: { ...typography.caption, color: colors.muted, flexShrink: 0 },
  preview: { ...typography.caption, color: colors.mutedSoft, fontSize: 12, lineHeight: 17 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  badgeText: { ...typography.caption, color: colors.bgDeep, fontWeight: '800', fontSize: 11 },
  arrow: { color: colors.goldDim, fontSize: 20 },
  empty: { ...typography.body, color: colors.mutedSoft },
  emptyState: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  mark: { fontSize: 38, color: colors.gold },
  emptyTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  emptyHint: { ...typography.body, color: colors.mutedSoft, textAlign: 'center' },
});
