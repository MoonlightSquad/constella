<script setup lang="ts">
import { computed } from 'vue'
import { useLocale, type TranslationKey } from '~/composables/useLocale'

const props = defineProps<{
  quests: { xp: number; level: number; achievements: any[]; daily: any[]; referralCode?: string | null; botUsername?: string | null } | null
}>()

const emit = defineEmits<{
  invite: []
  toast: [msg: string]
}>()

const { t } = useLocale()
const config = useRuntimeConfig()
const currentLevelProgress = computed(() => (props.quests ? props.quests.xp % 250 : 0))

const questTitle = (code: string) => t(({
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
} as Record<string, TranslationKey>)[code] || 'dashboard.quests')

const questDescription = (code: string) => t(({
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
} as Record<string, TranslationKey>)[code] || 'dashboard.quests')

// --- Share with friends (invite quest) ---
const botUsername = computed(() => String(props.quests?.botUsername || (config.public as any).telegramBotUsername || ''))
const referralUrl = computed(() => {
  const code = props.quests?.referralCode
  return code && botUsername.value ? `https://t.me/${botUsername.value}?start=ref_${code}` : ''
})
const inviteDone = computed(() => (props.quests?.daily ?? []).some((quest: any) => quest.code === 'invite-friend' && quest.completedAt))

const shareWithFriends = async () => {
  if (!referralUrl.value) { emit('toast', t('dashboard.shareUnavailable')); return }
  const text = t('dashboard.shareText')
  let shared = false
  try {
    const telegram = (window as any).Telegram?.WebApp
    // The SDK script is bundled everywhere, so only trust it inside Telegram.
    if (telegram?.initData && telegram.openTelegramLink) {
      telegram.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralUrl.value)}&text=${encodeURIComponent(text)}`)
      shared = true
    } else if (navigator.share) {
      await navigator.share({ title: 'Constella', text, url: referralUrl.value })
      shared = true
    } else {
      await navigator.clipboard.writeText(`${text} ${referralUrl.value}`)
      emit('toast', t('dashboard.shareCopied'))
      shared = true
    }
  } catch { /* user dismissed the native share sheet */ }
  if (shared && !inviteDone.value) emit('invite')
}
</script>

<template>
  <section class="view">
    <p class="eyebrow">{{ t('dashboard.questsEyebrow') }}</p>
    <div class="view-heading"><h1>{{ t('dashboard.quests') }}</h1><span class="level-chip">{{ t('dashboard.level', { level: quests?.level ?? 1 }) }}</span></div>
    <div class="xp-panel">
      <div class="xp-heading"><strong>{{ quests?.xp ?? 0 }} {{ t('dashboard.xp') }}</strong><span>{{ t('dashboard.xpToLevel', { count: 250 - currentLevelProgress }) }}</span></div>
      <div class="xp-track"><span :style="{ width: `${(currentLevelProgress / 250) * 100}%` }" /></div>
    </div>
    <section class="share-card">
      <div class="share-copy">
        <h2>{{ t('dashboard.shareTitle') }}</h2>
        <p>{{ t('dashboard.shareDesc') }}</p>
        <small v-if="quests?.referralCode">{{ t('dashboard.shareCode', { code: quests.referralCode }) }}</small>
      </div>
      <button class="share-button" type="button" @click="shareWithFriends">
        <span aria-hidden="true">↗</span>{{ t('dashboard.shareButton') }}
      </button>
    </section>
    <div class="quest-list">
      <article v-for="quest in quests?.daily ?? []" :key="quest.code" class="quest-row">
        <div class="quest-star" :class="{ earned: quest.completedAt }">✦</div>
        <div class="quest-copy"><h2>{{ questTitle(quest.code) }}</h2><p>{{ questDescription(quest.code) }}</p><div class="quest-progress"><span :style="{ width: `${Math.min(100, (quest.progress / quest.target) * 100)}%` }" /></div><small>{{ quest.progress }} / {{ quest.target }}</small></div>
        <div class="quest-reward"><strong>+{{ quest.xp }}</strong><small>{{ t('dashboard.xp') }}</small><span v-if="quest.completedAt">{{ t('dashboard.earned') }}</span></div>
      </article>
      <article v-for="quest in quests?.achievements ?? []" :key="quest.code" class="quest-row">
        <div class="quest-star" :class="{ earned: quest.earnedAt }">✦</div>
        <div class="quest-copy"><h2>{{ questTitle(quest.code) }}</h2><p>{{ questDescription(quest.code) }}</p></div>
        <div class="quest-reward"><strong>+{{ quest.xp }}</strong><small>{{ t('dashboard.xp') }}</small><span v-if="quest.earnedAt">{{ t('dashboard.earned') }}</span></div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.view { width: min(100%, 720px); margin: 0 auto; }
.eyebrow { margin: 0 0 10px; color: #85c9b9; font-size: 10px; font-weight: 750; letter-spacing: .14em; }
.view-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
h1 { margin: 0; font-size: clamp(25px, 6vw, 34px); line-height: 1.12; }
.level-chip { border: 1px solid #9d815c; border-radius: 99px; padding: 7px 10px; color: #e4c28b; font-size: 11px; }
.xp-panel { margin-bottom: 16px; border: 1px solid #344444; border-radius: 9px; padding: 15px; background: #132122; }
.xp-heading { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.xp-heading strong { color: #e4b46c; }
.xp-heading span { color: #91a19d; font-size: 11px; }
.xp-track { height: 7px; overflow: hidden; border-radius: 99px; background: #263738; }
.xp-track span { display: block; height: 100%; border-radius: inherit; background: #82c7b7; transition: width .3s ease; }
.quest-list { border-top: 1px solid #2b3c3d; }
.share-card { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; border: 1px solid #4a3f2b; border-radius: 9px; padding: 15px; background: linear-gradient(135deg, #1c2420, #241f16); }
.share-copy { min-width: 0; flex: 1; }
.share-copy h2 { margin: 0; font-size: 14px; }
.share-copy p { margin: 4px 0 0; color: #91a19d; font-size: 11px; line-height: 1.45; }
.share-copy small { display: block; margin-top: 6px; color: #cba465; font-size: 10px; letter-spacing: .04em; }
.share-button { display: flex; flex: 0 0 auto; align-items: center; gap: 7px; min-height: 40px; border: 0; border-radius: 8px; padding: 0 14px; background: #d9ad6d; color: #15201d; font-size: 12px; font-weight: 750; cursor: pointer; }
.share-button span { font-size: 14px; }
.quest-row { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #2b3c3d; padding: 15px 0; }
.quest-star { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border: 1px solid #465451; border-radius: 50%; color: #758580; }
.quest-star.earned { border-color: #cba465; color: #e4b46c; }
.quest-copy { min-width: 0; flex: 1; }
.quest-copy h2 { margin: 0; font-size: 14px; }
.quest-copy p { margin: 4px 0 0; color: #91a19d; font-size: 11px; line-height: 1.45; }
.quest-progress { height: 4px; overflow: hidden; margin-top: 7px; border-radius: 4px; background: #263738; }
.quest-progress span { display: block; height: 100%; background: #82c7b7; }
.quest-reward { display: grid; justify-items: end; color: #e4b46c; }
.quest-reward strong { font-size: 13px; }
.quest-reward small, .quest-reward span { color: #8fa09a; font-size: 9px; }
@media (max-width: 450px) { .xp-heading { align-items: start; flex-direction: column; gap: 4px; } }
</style>
