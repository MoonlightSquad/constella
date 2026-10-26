import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Button, Eyebrow, LoadIssue, Screen, Subtitle, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/i18n/locale-provider';
import { useDashboard } from '@/state/dashboard';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function SparksScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const { sparks, incoming, matches, issue, refreshAll, likeBack } = useDashboard();
  const [likingId, setLikingId] = useState<string | null>(null);

  const handleLikeBack = async (profileId: string) => {
    if (likingId) return;
    setLikingId(profileId);
    const matched = await likeBack(profileId);
    setLikingId(null);
    if (matched) router.push('/chats');
  };

  return (
    <Screen>
      <View style={styles.topline}>
        <Eyebrow>{t('dashboard.sparksEyebrow')}</Eyebrow>
        <LanguageSwitcher />
      </View>
      <View style={styles.heading}>
        <Title>{t('dashboard.sparks')}</Title>
        <Text style={styles.counter}>{String(sparks)}</Text>
      </View>
      {issue ? <LoadIssue message={issue} onRetry={() => void refreshAll()} retryLabel={t('app.retry')} /> : null}

      {!sparks ? (
        <View style={styles.panel}>
          <Text style={styles.mark}>✦</Text>
          <Text style={styles.panelTitle}>{t('dashboard.sparkEmpty')}</Text>
          <Subtitle style={styles.centered}>{t('dashboard.sparkHint')}</Subtitle>
          <Button label={t('dashboard.viewOrbit')} onPress={() => router.navigate('/')} variant="secondary" />
        </View>
      ) : !incoming?.vip ? (
        <View style={styles.panel}>
          <Text style={styles.mark}>✦</Text>
          <Text style={styles.panelTitle}>{t('dashboard.sparkSomeone')}</Text>
          <Subtitle style={styles.centered}>{t('dashboard.sparkCount', { count: sparks })}</Subtitle>
          <View accessibilityElementsHidden importantForAccessibility="no" style={styles.teasers}>
            {[0, 1, 2].slice(0, Math.min(sparks, 3)).map((n) => (
              <View key={n} style={styles.teaser}>
                <Text style={styles.teaserMark}>?</Text>
              </View>
            ))}
          </View>
          <Button label={t('dashboard.viewVip')} onPress={() => router.navigate('/sky')} />
          <Button label={t('dashboard.viewOrbit')} onPress={() => router.navigate('/')} variant="secondary" />
        </View>
      ) : (
        <View style={styles.likes}>
          <Subtitle style={styles.likesIntro}>{t('dashboard.likesIntro', { count: incoming.count })}</Subtitle>
          {incoming.profiles.map((person) => (
            <View key={person.id} style={styles.likeRow}>
              {person.photos[0] ? (
                <Image accessibilityLabel={t('dashboard.verifiedProfile')} contentFit="cover" source={{ uri: person.photos[0] }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarMark}>✦</Text>
                </View>
              )}
              <View style={styles.matchCopy}>
                <Text style={styles.matchName}>{`${person.displayName} · ${person.age}`}</Text>
                <Text style={styles.matchMeta}>{person.city || '—'}</Text>
              </View>
              <Pressable
                accessibilityLabel={t('dashboard.likeBack')}
                accessibilityRole="button"
                disabled={likingId !== null}
                onPress={() => void handleLikeBack(person.id)}
                style={({ pressed }) => [styles.likeBack, pressed && styles.likeBackPressed, likingId === person.id && styles.likeBackBusy]}
              >
                <Text style={styles.likeBackLabel}>{t('dashboard.likeBack')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {matches.length ? (
        <View style={styles.matches}>
          <Eyebrow>{t('dashboard.mutualEyebrow')}</Eyebrow>
          {matches.slice(0, 5).map((match) => (
            <Pressable
              accessibilityLabel={match.profile?.displayName ?? t('dashboard.newMatch')}
              accessibilityRole="button"
              key={match.id}
              onPress={() => router.push(`/chat/${match.id}`)}
              style={({ pressed }) => [styles.matchRow, pressed && styles.matchRowPressed]}
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
              <View style={styles.matchCopy}>
                <Text style={styles.matchName}>{match.profile?.displayName || t('dashboard.newMatch')}</Text>
                <Text style={styles.matchMeta}>
                  {match.unread > 0 ? t('chats.unread', { count: match.unread }) : t('dashboard.matchStart')}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  counter: { ...typography.display, color: colors.gold, fontSize: 26 },
  panel: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  mark: { fontSize: 40, color: colors.gold },
  panelTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  centered: { textAlign: 'center' },
  teasers: { flexDirection: 'row', gap: spacing.sm },
  teaser: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgDeep,
  },
  teaserMark: { color: colors.mutedSoft, fontSize: 20, fontWeight: '700' },
  likes: { gap: spacing.md },
  likesIntro: { marginBottom: spacing.xs },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  matchCopy: { flex: 1, gap: 2 },
  matchName: { ...typography.title, color: colors.text, fontSize: 16 },
  matchMeta: { ...typography.caption, color: colors.mutedSoft },
  likeBack: {
    borderWidth: 1,
    borderColor: colors.goldDeep,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  likeBackPressed: { backgroundColor: colors.goldDeep },
  likeBackBusy: { opacity: 0.6 },
  likeBackLabel: { ...typography.label, color: colors.gold },
  matches: { gap: spacing.md },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  matchRowPressed: { borderColor: colors.borderStrong, opacity: 0.9 },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.bgDeep },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgDeep,
  },
  avatarMark: { color: colors.goldDim, fontSize: 18 },
});
