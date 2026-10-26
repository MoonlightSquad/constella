import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Eyebrow, LoadIssue, Screen, Title } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useLocale } from '@/i18n/locale-provider';
import { useDashboard } from '@/state/dashboard';
import type { TranslationKey } from '@/i18n/messages';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { XP_PER_LEVEL } from '@constella/shared/client';

/** Той самий мап кодів на ключі словника, що в `QuestsPanel.vue`. */
const QUEST_TITLES: Record<string, TranslationKey> = {
  'swipe-20': 'dashboard.swipe20',
  'superlike-1': 'dashboard.superlike1',
  'message-5': 'dashboard.message5',
  'voice-1': 'dashboard.voice1',
  'photo-1': 'dashboard.photo1',
  'invite-friend': 'dashboard.inviteFriend',
  'first-light': 'dashboard.firstLight',
  'profile-100': 'dashboard.profile100',
  'first-hello': 'dashboard.firstHello',
  'dialog-master': 'dashboard.dialogMaster',
  'good-conversation': 'dashboard.goodConversation',
  'owl': 'dashboard.owl',
  'early-bird': 'dashboard.earlyBird',
  'magnet-50': 'dashboard.magnet50',
  'magnet-100': 'dashboard.magnet100',
  'magnet-500': 'dashboard.magnet500',
  'star-patron': 'dashboard.starPatron',
  'streak-7': 'dashboard.streak7',
};

const QUEST_DESCRIPTIONS: Record<string, TranslationKey> = {
  'swipe-20': 'dashboard.swipe20Desc',
  'superlike-1': 'dashboard.superlike1Desc',
  'message-5': 'dashboard.message5Desc',
  'voice-1': 'dashboard.voice1Desc',
  'photo-1': 'dashboard.photo1Desc',
  'invite-friend': 'dashboard.inviteFriendDesc',
  'first-light': 'dashboard.firstLightDesc',
  'profile-100': 'dashboard.profile100Desc',
  'first-hello': 'dashboard.firstHelloDesc',
  'dialog-master': 'dashboard.dialogMasterDesc',
  'good-conversation': 'dashboard.goodConversationDesc',
  'owl': 'dashboard.owlDesc',
  'early-bird': 'dashboard.earlyBirdDesc',
  'magnet-50': 'dashboard.magnet50Desc',
  'magnet-100': 'dashboard.magnet100Desc',
  'magnet-500': 'dashboard.magnet500Desc',
  'star-patron': 'dashboard.starPatronDesc',
  'streak-7': 'dashboard.streak7Desc',
};

export default function QuestsScreen() {
  const { t } = useLocale();
  const { quests: data, issue, loadQuests, completeInvite } = useDashboard();
  const [sharing, setSharing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadQuests();
    }, [loadQuests]),
  );

  const progress = data ? data.xp % XP_PER_LEVEL : 0;
  const referralUrl =
    data?.referralCode && data?.botUsername
      ? `https://t.me/${data.botUsername}?start=ref_${data.referralCode}`
      : '';
  const inviteDone = (data?.daily ?? []).some((quest) => quest.code === 'invite-friend' && quest.completedAt);

  const shareWithFriends = async () => {
    if (!referralUrl || sharing) return;
    setSharing(true);
    try {
      const result = await Share.share({ message: `${t('dashboard.shareText')} ${referralUrl}` });
      // На Android діалог завжди повертає 'shared'; скасування буфаємо лише за 'dismissed'.
      if (result.action !== 'dismissed' && !inviteDone) await completeInvite();
    } catch {
      /* користувач закрив системний шаринг — нічого не робимо */
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topline}>
        <Eyebrow>{t('dashboard.questsEyebrow')}</Eyebrow>
        <LanguageSwitcher />
      </View>
      <View style={styles.heading}>
        <Title>{t('dashboard.quests')}</Title>
        <Text style={styles.levelChip}>{t('dashboard.level', { level: data?.level ?? 1 })}</Text>
      </View>
      {issue ? <LoadIssue message={issue} onRetry={() => void loadQuests()} retryLabel={t('app.retry')} /> : null}

      <View style={styles.xp}>
        <View style={styles.xpHead}>
          <Text style={styles.xpValue}>{`${data?.xp ?? 0} ${t('dashboard.xp')}`}</Text>
          <Text style={styles.xpHint}>{t('dashboard.xpToLevel', { count: XP_PER_LEVEL - progress })}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${(progress / XP_PER_LEVEL) * 100}%` }]} />
        </View>
        <View style={styles.streakRow}>
          <Text style={styles.streak}>{t('quests.streak', { count: data?.streak ?? 0 })}</Text>
          <Text style={styles.streak}>{t('quests.freezes', { count: data?.freezes ?? 0 })}</Text>
        </View>
      </View>

      <View style={styles.shareCard}>
        <View style={styles.shareCopy}>
          <Text style={styles.shareTitle}>{t('dashboard.shareTitle')}</Text>
          <Text style={styles.shareText}>{t('dashboard.shareDesc')}</Text>
          {data?.referralCode ? <Text style={styles.shareCode}>{t('dashboard.shareCode', { code: data.referralCode })}</Text> : null}
        </View>
        <Pressable
          onPress={shareWithFriends}
          disabled={!referralUrl || sharing}
          style={({ pressed }) => [
            styles.shareButton,
            (!referralUrl || sharing || pressed) && styles.shareButtonDim,
          ]}
        >
          <Text style={styles.shareButtonText}>{t('dashboard.shareButton')}</Text>
        </Pressable>
      </View>

      <View style={styles.group}>
        <Eyebrow>{t('quests.daily')}</Eyebrow>
        {(data?.daily ?? []).map((quest) => (
          <View key={quest.code} style={styles.row}>
            <Text style={[styles.rowMark, quest.completedAt ? styles.rowMarkEarned : null]}>✦</Text>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t(QUEST_TITLES[quest.code] ?? 'dashboard.quests')}</Text>
              <Text style={styles.rowText}>{t(QUEST_DESCRIPTIONS[quest.code] ?? 'dashboard.quests')}</Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.trackFill,
                    { width: `${Math.min(100, (quest.progress / quest.target) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.rowMeta}>{`${quest.progress} / ${quest.target}`}</Text>
            </View>
            <View style={styles.rowReward}>
              <Text style={styles.rewardValue}>{`+${quest.xp}`}</Text>
              <Text style={styles.rewardLabel}>{t('dashboard.xp')}</Text>
              {quest.completedAt ? <Text style={styles.rewardEarned}>{t('dashboard.earned')}</Text> : null}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.group}>
        <Eyebrow>{t('quests.achievements')}</Eyebrow>
        {(data?.achievements ?? []).map((achievement) => (
          <View key={achievement.code} style={styles.row}>
            <Text style={[styles.rowMark, achievement.earnedAt ? styles.rowMarkEarned : null]}>✦</Text>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t(QUEST_TITLES[achievement.code] ?? 'dashboard.quests')}</Text>
              <Text style={styles.rowText}>{t(QUEST_DESCRIPTIONS[achievement.code] ?? 'dashboard.quests')}</Text>
            </View>
            <View style={styles.rowReward}>
              <Text style={styles.rewardValue}>{`+${achievement.xp}`}</Text>
              <Text style={styles.rewardLabel}>{t('dashboard.xp')}</Text>
              {achievement.earnedAt ? <Text style={styles.rewardEarned}>{t('dashboard.earned')}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  levelChip: {
    ...typography.label,
    color: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  xp: { gap: spacing.sm },
  xpHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md },
  xpValue: { ...typography.title, color: colors.text },
  xpHint: { ...typography.caption, color: colors.muted },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  trackFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.mint },
  streakRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  streak: { ...typography.caption, color: colors.mutedSoft },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  shareCopy: { flex: 1, gap: spacing.xs },
  shareTitle: { ...typography.title, color: colors.text, fontSize: 16 },
  shareText: { ...typography.caption, color: colors.mutedSoft, lineHeight: 17 },
  shareCode: { ...typography.caption, color: colors.gold, fontSize: 11 },
  shareButton: {
    borderRadius: radius.md,
    backgroundColor: colors.goldDeep,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  shareButtonDim: { opacity: 0.6 },
  shareButtonText: { ...typography.label, color: colors.bg },
  group: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  rowMark: { fontSize: 18, color: colors.goldDim, marginTop: 1 },
  rowMarkEarned: { color: colors.gold },
  rowCopy: { flex: 1, gap: spacing.xs },
  rowTitle: { ...typography.title, color: colors.text, fontSize: 16 },
  rowText: { ...typography.caption, color: colors.mutedSoft, lineHeight: 17 },
  rowMeta: { ...typography.caption, color: colors.muted },
  rowReward: { alignItems: 'flex-end', gap: 1, minWidth: 54 },
  rewardValue: { ...typography.title, color: colors.mintSoft, fontSize: 16 },
  rewardLabel: { ...typography.caption, color: colors.muted },
  rewardEarned: { ...typography.caption, color: colors.gold },
});
