<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLocale, type TranslationKey } from '~/composables/useLocale'

type Tab = 'orbit' | 'sparks' | 'chats' | 'quests' | 'sky'
type Profile = {
  id: string
  displayName: string
  age: number
  gender: string
  city: string | null
  bio: string | null
  photos: string[]
  prompts: string[]
  verified: boolean
}
type Match = {
  id: string
  createdAt: string
  profile: Profile | null
  lastMessage: { body: string; sentByMe: boolean; createdAt: string } | null
}

const props = defineProps<{
  account: Record<string, any>
  isAdmin?: boolean
}>()

const emit = defineEmits<{
  editProfile: []
  openAdmin: []
  logout: []
  deleteAccount: []
}>()

const { $trpc } = useNuxtApp() as any
const { locale, t } = useLocale()
const activeTab = ref<Tab>('orbit')
const supportOpen = ref(false)
const orbitProfiles = ref<Profile[]>([])
const matches = ref<Match[]>([])
const quests = ref<{ xp: number; level: number; achievements: any[]; daily: any[] } | null>(null)
const billingStatus = ref<any>(null)
const isBuying = ref<string | null>(null)
const incomingSparks = ref(0)
const orbitRemaining = ref(0)
const orbitDate = ref('')
const releasePending = ref(false)
const selectedMatch = ref<Match | null>(null)
const chatMessages = ref<any[]>([])
const chatDraft = ref('')
const isLoading = ref(true)
const isSending = ref(false)
const dragX = ref(0)
const dragY = ref(0)
const isDragging = ref(false)
let pointerStartX = 0
let pointerStartY = 0
const toast = ref('')
const issue = ref('')
const safetyTarget = ref<{ profileId: string; matchId?: string; label: string } | null>(null)
const reportReason = ref('spam')
const reportDetails = ref('')
const currentProfile = computed(() => orbitProfiles.value[0] ?? null)

const tabs: { id: Tab; label: TranslationKey; symbol: string }[] = [
  { id: 'orbit', label: 'dashboard.orbit', symbol: '✦' },
  { id: 'sparks', label: 'dashboard.sparks', symbol: '♡' },
  { id: 'chats', label: 'dashboard.chats', symbol: '◌' },
  { id: 'quests', label: 'dashboard.quests', symbol: '☆' },
  { id: 'sky', label: 'dashboard.sky', symbol: '☾' },
]

const showError = (error: any) => {
  issue.value = error?.message || t('dashboard.loadError')
}

const loadOrbit = async () => {
  const result = await $trpc.social.orbit.query()
  orbitProfiles.value = result.profiles
  orbitRemaining.value = result.remaining
  orbitDate.value = result.date
  releasePending.value = result.releasePending
}

const loadMatches = async () => {
  matches.value = await $trpc.social.matches.query()
}

const loadQuests = async () => {
  quests.value = await $trpc.social.quests.query()
}

const loadBilling = async () => {
  billingStatus.value = await $trpc.billing.status.query()
}

const cancelVip = async () => {
  if (!(await requestConfirmation('Скасувати автоматичне поновлення VIP? Доступ залишиться до кінця оплаченого періоду.'))) return
  try {
    await $trpc.billing.cancelSubscription.mutate()
    await loadBilling()
    toast.value = 'Автоматичне поновлення VIP скасовано.'
  } catch (error) {
    showError(error)
  }
}
const buyProduct = async (sku: string) => {
  if (isBuying.value) return
  isBuying.value = sku
  try {
    const invoice = await $trpc.billing.createInvoice.mutate({ sku })
    const telegram = (window as any).Telegram?.WebApp
    if (telegram?.openInvoice) {
      telegram.openInvoice(invoice.invoiceLink, async (status: string) => {
        if (status === 'paid') {
          toast.value = 'Оплату підтверджено! ⭐'
          await Promise.all([loadBilling(), loadOrbit()])
        } else if (status === 'pending') {
          toast.value = 'Оплата обробляється. Статус оновиться після підтвердження Telegram.'
          window.setTimeout(() => { void loadBilling() }, 2500)
        } else if (status === 'failed') {
          showError(new Error('Не вдалося завершити оплату. Спробуй ще раз.'))
        }
      })
    } else {
      window.open(invoice.invoiceLink, '_blank', 'noopener,noreferrer')
    }
  } catch (error) {
    showError(error)
  } finally {
    isBuying.value = null
  }
}

const loadSparks = async () => {
  const result = await $trpc.social.incomingSparks.query()
  incomingSparks.value = result.count
}

const refreshAll = async () => {
  isLoading.value = true
  issue.value = ''
  try {
    await Promise.all([loadOrbit(), loadMatches(), loadQuests(), loadSparks(), loadBilling()])
  } catch (error) {
    showError(error)
  } finally {
    isLoading.value = false
  }
}

const onCardPointerDown = (event: PointerEvent) => {
  pointerStartX = event.clientX
  pointerStartY = event.clientY
  isDragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

const onCardPointerMove = (event: PointerEvent) => {
  if (!isDragging.value) return
  dragX.value = event.clientX - pointerStartX
  dragY.value = event.clientY - pointerStartY
}

const onCardPointerUp = async () => {
  if (!isDragging.value) return
  isDragging.value = false
  const x = dragX.value
  const y = dragY.value
  dragX.value = 0
  dragY.value = 0
  if (y < -100 && Math.abs(y) > Math.abs(x)) await reactToProfile('super')
  else if (x > 100 && Math.abs(x) > Math.abs(y)) await reactToProfile('spark')
  else if (x < -100 && Math.abs(x) > Math.abs(y)) await reactToProfile('pass')
}
const reactToProfile = async (kind: 'spark' | 'pass' | 'super') => {
  const profile = currentProfile.value
  if (!profile) return

  try {
    const result = await $trpc.social.swipe.mutate({ profileId: profile.id, kind })
    if (result.matched) {
      toast.value = t('dashboard.matchToast')
      await Promise.all([loadMatches(), loadQuests()])
      activeTab.value = 'chats'
    }
    await loadOrbit()
    window.setTimeout(() => { toast.value = '' }, 3600)
  } catch (error) {
    showError(error)
  }
}

const openChat = async (match: Match) => {
  selectedMatch.value = match
  activeTab.value = 'chats'
  await loadChatMessages()
}

const loadChatMessages = async () => {
  if (!selectedMatch.value) return
  try {
    chatMessages.value = await $trpc.social.chatMessages.query({ matchId: selectedMatch.value.id })
  } catch (error) {
    showError(error)
  }
}

const sendMessage = async () => {
  const body = chatDraft.value.trim()
  if (!body || !selectedMatch.value || isSending.value) return
  isSending.value = true
  try {
    await $trpc.social.sendMessage.mutate({ matchId: selectedMatch.value.id, body })
    chatDraft.value = ''
    await Promise.all([loadChatMessages(), loadMatches(), loadQuests()])
  } catch (error) {
    showError(error)
  } finally {
    isSending.value = false
  }
}

const requestConfirmation = (message: string) => new Promise<boolean>((resolve) => {
  const telegram = window.Telegram?.WebApp
  if (telegram?.showConfirm) telegram.showConfirm(message, resolve)
  else resolve(window.confirm(message))
})

const blockProfile = async (profileId: string, matchId?: string) => {
  if (!(await requestConfirmation(t('dashboard.blockConfirm')))) return
  try {
    await $trpc.social.blockProfile.mutate({ profileId })
    safetyTarget.value = null
    toast.value = t('dashboard.blocked')
    if (matchId && selectedMatch.value?.id === matchId) selectedMatch.value = null
    await refreshAll()
    window.setTimeout(() => { toast.value = '' }, 3600)
  } catch (error) {
    showError(error)
  }
}

const openReport = (profile: Profile, matchId?: string) => {
  safetyTarget.value = { profileId: profile.id, matchId, label: profile.displayName }
  reportReason.value = 'spam'
  reportDetails.value = ''
}

const submitReport = async () => {
  if (!safetyTarget.value) return
  try {
    await $trpc.social.reportProfile.mutate({
      ...safetyTarget.value,
      reason: reportReason.value,
      details: reportDetails.value.trim() || undefined,
    })
    toast.value = t('dashboard.reportThanks')
    safetyTarget.value = null
    window.setTimeout(() => { toast.value = '' }, 3600)
  } catch (error) {
    showError(error)
  }
}

const localeTag: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }
const formatTime = (date: string | Date) =>
  new Intl.DateTimeFormat(localeTag[locale.value], { hour: '2-digit', minute: '2-digit' }).format(new Date(date))

const formatOrbitDate = (date: string) =>
  new Intl.DateTimeFormat(localeTag[locale.value], { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))

const sparkDescription = computed(() =>
  incomingSparks.value
    ? t('dashboard.sparkCount', { count: incomingSparks.value })
    : t('dashboard.sparkHint')
)

const questTitle = (code: string) => t(({
  'swipe-20': 'dashboard.swipe20',
  'superlike-1': 'dashboard.superlike1',
  'invite-friend': 'dashboard.inviteFriend',
  'first-light': 'dashboard.firstLight',
  'first-hello': 'dashboard.firstHello',
  'good-conversation': 'dashboard.goodConversation',
} as Record<string, TranslationKey>)[code] || 'dashboard.quests')

const questDescription = (code: string) => t(({
  'swipe-20': 'dashboard.swipe20Desc',
  'superlike-1': 'dashboard.superlike1Desc',
  'invite-friend': 'dashboard.inviteFriendDesc',
  'first-light': 'dashboard.firstLightDesc',
  'first-hello': 'dashboard.firstHelloDesc',
  'good-conversation': 'dashboard.goodConversationDesc',
} as Record<string, TranslationKey>)[code] || 'dashboard.quests')

const genderLabel = (gender: string) => t(({
  woman: 'profile.women',
  man: 'profile.men',
  nonbinary: 'profile.nonbinary',
  other: 'profile.other',
} as Record<string, TranslationKey>)[gender] || 'dashboard.notSet')

const currentLevelProgress = computed(() => (quests.value ? quests.value.xp % 250 : 0))

let refreshTimer: number | undefined
onMounted(() => {
  void refreshAll()
  refreshTimer = window.setInterval(() => {
    if (activeTab.value === 'chats' && selectedMatch.value) void loadChatMessages()
  }, 5000)
})
onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="product-shell">
    <header class="topbar">
      <a class="brand" href="#orbit" @click.prevent="activeTab = 'orbit'">
        <span class="brand-mark">✦</span>
        <span>{{ t('dashboard.brand') }}</span>
      </a>
      <div class="topbar-meta">
        <LanguageSwitcher />
        <span class="orbit-date">{{ orbitDate ? formatOrbitDate(orbitDate) : t('dashboard.skyDate') }}</span>
        <button class="avatar-button" type="button" :aria-label="t('dashboard.profileAccessible')" @click="activeTab = 'sky'">
          {{ props.account.profile?.city?.slice(0, 1)?.toUpperCase() || 'C' }}
        </button>
      </div>
    </header>

    <main class="main-content">
      <div v-if="issue" class="notice error-notice" role="alert">
        <span>{{ issue }}</span>
        <button type="button" @click="refreshAll">{{ t('dashboard.retry') }}</button>
      </div>
      <div v-if="toast" class="notice success-notice" role="status">{{ toast }}</div>

      <section v-if="activeTab === 'orbit'" class="view orbit-view">
        <div class="view-heading">
          <div>
            <p class="eyebrow">{{ t('dashboard.orbitEyebrow') }}</p>
            <h1>{{ t('dashboard.orbitTitle') }}</h1>
          </div>
          <span class="counter">{{ orbitRemaining }} <small>/ 8</small></span>
        </div>

        <div v-if="isLoading" class="empty-state">{{ t('dashboard.loadingOrbit') }}</div>
        <article v-else-if="currentProfile" class="profile-card" :class="{ dragging: isDragging }" :style="{ transform: `translate(${dragX}px, ${dragY}px) rotate(${dragX / 22}deg)` }">
          <div class="profile-photo" @pointerdown="onCardPointerDown" @pointermove="onCardPointerMove" @pointerup="onCardPointerUp" @pointercancel="onCardPointerUp">
            <img v-if="currentProfile.photos[0]" :src="currentProfile.photos[0]" :alt="t('dashboard.verifiedProfile')" class="profile-image">
            <div v-else class="photo-placeholder"><span>✦</span></div>
            <div class="photo-label">
              <span class="profile-location">{{ currentProfile.city || t('dashboard.noCity') }}</span>
              <span v-if="currentProfile.verified" class="verified-badge">{{ t('dashboard.verified') }}</span>
            </div>
          </div>
          <div class="profile-copy">
            <div class="profile-name"><h2>{{ currentProfile.displayName }}, {{ currentProfile.age }}</h2><span>{{ t('dashboard.years') }}</span></div>
            <p class="profile-bio">{{ currentProfile.bio }}</p>
            <blockquote v-for="(prompt, index) in currentProfile.prompts" :key="index" class="prompt-line">“{{ prompt }}”</blockquote>
          </div>
          <div class="profile-actions">
            <button class="pass-button" type="button" :aria-label="t('dashboard.pass')" @click="reactToProfile('pass')">{{ t('dashboard.pass') }}</button>
            <button class="spark-button" type="button" @click="reactToProfile('spark')"><span>✦</span> {{ t('dashboard.sendSpark') }}</button>
            <button class="super-button" type="button" @click="reactToProfile('super')">★</button>
          </div>
          <div class="safety-actions">
            <button type="button" @click="openReport(currentProfile)">{{ t('dashboard.report') }}</button>
            <button type="button" @click="blockProfile(currentProfile.id)">{{ t('dashboard.block') }}</button>
          </div>
        </article>
        <div v-else class="empty-state orbit-empty">
          <span class="empty-star">✦</span>
          <h2>{{ t(releasePending ? 'dashboard.releasePending' : 'dashboard.emptyOrbit') }}</h2>
          <p>{{ t(releasePending ? 'dashboard.releaseDescription' : 'dashboard.emptyOrbitDescription') }}</p>
          <button v-if="!releasePending" type="button" class="text-button" @click="refreshAll">{{ t('dashboard.refreshOrbit') }}</button>
        </div>
        <p class="privacy-caption">{{ t('dashboard.dailyLimit') }}</p>
      </section>

      <section v-else-if="activeTab === 'sparks'" class="view">
        <p class="eyebrow">{{ t('dashboard.sparksEyebrow') }}</p>
        <div class="view-heading"><h1>{{ t('dashboard.sparks') }}</h1><span class="counter">{{ incomingSparks }}</span></div>
        <div class="unlocks-panel">
          <div class="spark-orbit">✦</div>
          <h2>{{ t(incomingSparks ? 'dashboard.sparkSomeone' : 'dashboard.sparkEmpty') }}</h2>
          <p>{{ sparkDescription }}</p>
          <button class="secondary-button" type="button" @click="activeTab = 'orbit'">{{ t('dashboard.viewOrbit') }}</button>
        </div>
      </section>

      <section v-else-if="activeTab === 'chats'" class="view chats-view">
        <div v-if="selectedMatch" class="chat-panel">
          <header class="chat-header">
            <button class="back-button" type="button" :aria-label="t('dashboard.allChats')" @click="selectedMatch = null">←</button>
            <div class="mini-avatar">{{ selectedMatch.profile?.city?.slice(0, 1)?.toUpperCase() || '✦' }}</div>
            <div><h1>{{ selectedMatch.profile?.displayName || t('dashboard.newMatch') }}</h1><p>{{ selectedMatch.profile?.age }} {{ t('dashboard.years') }} · {{ selectedMatch.profile?.city }}</p></div>
            <button v-if="selectedMatch.profile" class="chat-safety" type="button" @click="openReport(selectedMatch.profile, selectedMatch.id)">{{ t('dashboard.reportShort') }}</button>
            <button v-if="selectedMatch.profile" class="chat-safety" type="button" @click="blockProfile(selectedMatch.profile.id, selectedMatch.id)">{{ t('dashboard.blockShort') }}</button>
            <button class="refresh-button" type="button" :aria-label="t('dashboard.refreshMessages')" @click="loadChatMessages">↻</button>
          </header>
          <div class="message-list" aria-live="polite">
            <p class="chat-date">{{ t('dashboard.chatDate') }} · {{ formatOrbitDate(selectedMatch.createdAt.slice(0, 10)) }}</p>
            <article v-for="message in chatMessages" :key="message.id" class="message" :class="{ mine: message.senderId === account.userId }">
              <p>{{ message.body }}</p>
              <time>{{ formatTime(message.createdAt) }}</time>
            </article>
            <p v-if="chatMessages.length === 0" class="chat-start">{{ t('dashboard.chatStart') }}</p>
          </div>
          <form class="composer" @submit.prevent="sendMessage">
            <input v-model="chatDraft" maxlength="1000" :placeholder="t('dashboard.messagePlaceholder')" autocomplete="off">
            <button type="submit" :disabled="isSending || !chatDraft.trim()" :aria-label="t('dashboard.send')">{{ isSending ? '…' : t('dashboard.send') }}</button>
          </form>
          <p class="chat-footnote">{{ t('dashboard.chatPolling') }}</p>
        </div>
        <template v-else>
          <p class="eyebrow">{{ t('dashboard.mutualEyebrow') }}</p>
          <div class="view-heading"><h1>{{ t('dashboard.chats') }}</h1><span class="counter">{{ matches.length }}</span></div>
          <div v-if="isLoading" class="empty-state">{{ t('dashboard.loadingChats') }}</div>
          <div v-else-if="matches.length" class="match-list">
            <button v-for="match in matches" :key="match.id" class="match-row" type="button" @click="openChat(match)">
              <div class="mini-avatar">{{ match.profile?.city?.slice(0, 1)?.toUpperCase() || '✦' }}</div>
              <div class="match-copy">
                <div class="match-title"><strong>{{ match.profile?.displayName || t('dashboard.newMatch') }}</strong><time>{{ match.lastMessage ? formatTime(match.lastMessage.createdAt) : formatTime(match.createdAt) }}</time></div>
                <p>{{ match.lastMessage ? `${match.lastMessage.sentByMe ? t('dashboard.you') : ''}${match.lastMessage.body}` : t('dashboard.matchStart') }}</p>
              </div>
              <span class="row-arrow">›</span>
            </button>
          </div>
          <div v-else class="empty-state">
            <span class="empty-star">♡</span>
            <h2>{{ t('dashboard.noMatches') }}</h2>
            <p>{{ t('dashboard.noMatchesHint') }}</p>
            <button type="button" class="text-button" @click="activeTab = 'orbit'">{{ t('dashboard.backOrbit') }}</button>
          </div>
        </template>
      </section>

      <section v-else-if="activeTab === 'quests'" class="view">
        <p class="eyebrow">{{ t('dashboard.questsEyebrow') }}</p>
        <div class="view-heading"><h1>{{ t('dashboard.quests') }}</h1><span class="level-chip">{{ t('dashboard.level', { level: quests?.level ?? 1 }) }}</span></div>
        <div class="xp-panel">
          <div class="xp-heading"><strong>{{ quests?.xp ?? 0 }} {{ t('dashboard.xp') }}</strong><span>{{ t('dashboard.xpToLevel', { count: 250 - currentLevelProgress }) }}</span></div>
          <div class="xp-track"><span :style="{ width: `${(currentLevelProgress / 250) * 100}%` }" /></div>
        </div>
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

      <section v-else-if="supportOpen" class="view sky-view"><SupportDesk @close="supportOpen = false" /></section>
      <section v-else class="view sky-view">
        <p class="eyebrow">{{ t('dashboard.profileEyebrow') }}</p>
        <div class="sky-heading">
          <div class="large-avatar">{{ account.profile?.city?.slice(0, 1)?.toUpperCase() || 'C' }}</div>
          <div><h1>{{ account.profile?.displayName || t('dashboard.profile') }}</h1><p>{{ account.profile?.city || t('dashboard.noCity') }} · {{ t('dashboard.level', { level: quests?.level ?? 1 }) }}</p></div>
        </div>
        <section class="sky-section"><h2>{{ t('dashboard.aboutMe') }}</h2><p>{{ account.profile?.bio || t('dashboard.addBio') }}</p></section>
        <section class="sky-section"><h2>{{ t('dashboard.lookingFor') }}</h2><p>{{ (account.profile?.lookingFor || []).map((gender: string) => genderLabel(gender)).join(', ') || t('dashboard.notSet') }}</p></section>
        <section class="sky-section"><h2>{{ t('dashboard.prompts') }}</h2><blockquote v-for="(prompt, index) in [account.profile?.promptOne, account.profile?.promptTwo, account.profile?.promptThree].filter(Boolean)" :key="index">{{ prompt }}</blockquote></section>
        <section class="sky-section premium-card">
          <h2>Constella VIP · 499 ⭐ / 30 днів</h2>
          <p v-if="billingStatus?.vip">VIP активний до {{ billingStatus.entitlement?.expiresAt ? new Date(billingStatus.entitlement.expiresAt).toLocaleDateString() : '—' }}</p>
          <p v-if="billingStatus?.entitlement?.renews === false">Автоматичне поновлення вимкнене.</p>
          <button v-if="billingStatus?.vip && billingStatus?.entitlement?.renews" class="text-button" type="button" @click="cancelVip">Скасувати поновлення</button>
          <p v-else>Безлімітні лайки, хто вподобав тебе, повернення анкети, режим інкогніто та паспорт.</p>
          <button v-if="!billingStatus?.vip" class="secondary-button wide-button" type="button" :disabled="isBuying || !billingStatus?.telegramAvailable" @click="buyProduct('vip')">
            {{ isBuying === 'vip' ? 'Готуємо рахунок…' : billingStatus?.telegramAvailable ? 'Оформити за Telegram Stars ⭐' : 'Оплата доступна в Telegram' }}
          </button>
          <button v-else class="secondary-button wide-button" type="button" @click="activeTab = 'orbit'">Повернутися до знайомств</button>
        </section>
        <section class="sky-section">
          <h2>Покращення за Telegram Stars ⭐</h2>
          <p>Boost — 100 ⭐ · Суперлайк — 25 ⭐ · Захист стріку — 15 ⭐</p>
          <div class="shop-actions">
            <button class="secondary-button" type="button" :disabled="isBuying !== null || !billingStatus?.telegramAvailable" @click="buyProduct('boost')">{{ isBuying === 'boost' ? '…' : 'Boost · 100 ⭐' }}</button>
            <button class="secondary-button" type="button" :disabled="isBuying !== null || !billingStatus?.telegramAvailable" @click="buyProduct('superlike')">{{ isBuying === 'superlike' ? '…' : `Суперлайк · 25 ⭐ (${billingStatus?.superlikeBalance ?? 0})` }}</button>
            <button class="secondary-button" type="button" :disabled="isBuying !== null || !billingStatus?.telegramAvailable" @click="buyProduct('freeze')">{{ isBuying === 'freeze' ? '…' : `Захист стріку · 15 ⭐ (${billingStatus?.streakFreezes ?? 0})` }}</button>
          </div>
        </section>
        <button class="secondary-button wide-button" type="button" @click="supportOpen = true">Звернутися до підтримки</button>
        <button class="secondary-button wide-button" type="button" @click="emit('editProfile')">{{ t('dashboard.editProfile') }}</button>
        <button v-if="isAdmin" class="secondary-button wide-button" type="button" @click="emit('openAdmin')">Відкрити адмінпанель</button>
        <button class="logout-button" type="button" @click="emit('logout')">{{ t('dashboard.logout') }}</button>
        <button class="delete-account" type="button" @click="emit('deleteAccount')">Видалити акаунт і дані</button>
      </section>
    </main>

    <div v-if="safetyTarget" class="modal-backdrop" @click.self="safetyTarget = null">
      <form class="report-dialog" @submit.prevent="submitReport">
        <p class="eyebrow">{{ t('dashboard.reportEyebrow') }}</p>
        <h2>{{ t('dashboard.reportTitle', { name: safetyTarget.label }) }}</h2>
        <label class="field-label">{{ t('dashboard.reportReason') }}
          <select v-model="reportReason">
            <option value="spam">{{ t('dashboard.reasonSpam') }}</option>
            <option value="harassment">{{ t('dashboard.reasonHarassment') }}</option>
            <option value="fake_profile">{{ t('dashboard.reasonFake') }}</option>
            <option value="underage">{{ t('dashboard.reasonUnderage') }}</option>
            <option value="other">{{ t('dashboard.reasonOther') }}</option>
          </select>
        </label>
        <label class="field-label">{{ t('dashboard.reportDetails') }}
          <textarea v-model="reportDetails" maxlength="500" rows="3" :placeholder="t('dashboard.reportPlaceholder')" />
        </label>
        <div class="dialog-actions">
          <button class="cancel-button" type="button" @click="safetyTarget = null">{{ t('dashboard.cancel') }}</button>
          <button class="send-report" type="submit">{{ t('dashboard.sendReport') }}</button>
        </div>
      </form>
    </div>

    <nav class="tabbar" :aria-label="t('dashboard.navigation')">
      <button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id; selectedMatch = null">
        <span class="tab-symbol">{{ tab.symbol }}</span>
        <span>{{ t(tab.label) }}</span>
        <i v-if="tab.id === 'chats' && matches.length" class="tab-dot" />
      </button>
    </nav>
  </div>
</template>

<style scoped>
.product-shell { min-height: 100svh; padding-bottom: calc(82px + env(safe-area-inset-bottom)); background: radial-gradient(ellipse at 50% -20%, #1b3631 0%, #0d1718 54%); color: #f3f5f2; }
.topbar { position: sticky; z-index: 5; top: 0; display: flex; height: 62px; align-items: center; justify-content: space-between; padding: 0 max(20px, calc((100vw - 1040px) / 2)); border-bottom: 1px solid #263536; background: #0d1718ee; backdrop-filter: blur(16px); }
.brand { display: flex; align-items: center; gap: 9px; color: #f3f5f2; font-size: 18px; font-weight: 760; text-decoration: none; }
.brand-mark { color: #e4b46c; font-size: 21px; }
.topbar-meta { display: flex; align-items: center; gap: 14px; }
.orbit-date { color: #9aaba7; font-size: 12px; }
.avatar-button, .mini-avatar, .large-avatar { display: grid; flex: 0 0 auto; place-items: center; border: 1px solid #587169; border-radius: 50%; background: #24423d; color: #dbf0e6; font-weight: 700; }
.avatar-button { width: 34px; height: 34px; }
.main-content { width: min(100%, 900px); min-height: calc(100svh - 144px); margin: 0 auto; padding: 34px 20px 24px; }
.view { width: min(100%, 720px); margin: 0 auto; }
.eyebrow { margin: 0 0 10px; color: #85c9b9; font-size: 10px; font-weight: 750; letter-spacing: .14em; }
.view-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
h1 { margin: 0; font-size: clamp(25px, 6vw, 34px); line-height: 1.12; }
.counter { display: inline-flex; align-items: baseline; gap: 3px; padding: 7px 10px; border: 1px solid #334545; border-radius: 8px; color: #e7bd7e; font-size: 18px; font-weight: 700; }
.counter small { color: #879995; font-size: 11px; font-weight: 500; }
.profile-card { overflow: hidden; will-change: transform; transition: transform .22s ease; border: 1px solid #314343; border-radius: 10px; background: #132122; }
.profile-card.dragging { transition: none; }
.profile-photo { touch-action: pan-y; position: relative; display: grid; min-height: 300px; aspect-ratio: 1.48; place-items: center; background-color: #243c38; background-position: center 35%; background-size: cover; }
.profile-image { position: absolute; width: 100%; height: 100%; object-fit: cover; object-position: center 35%; }
.profile-photo::after { position: absolute; inset: 35% 0 0; background: linear-gradient(180deg, transparent, #0c1718aa); content: ''; pointer-events: none; }
.photo-placeholder { display: grid; width: 82px; height: 82px; place-items: center; border: 1px solid #9ab8a94a; border-radius: 50%; color: #e4b46c; font-size: 34px; }
.photo-label { position: absolute; right: 16px; bottom: 15px; left: 16px; display: flex; align-items: end; justify-content: space-between; gap: 10px; }
.profile-location { color: #f0f3ef; font-size: 13px; font-weight: 650; text-shadow: 0 1px 7px #000; }
.verified-badge { border: 1px solid #86cdbb; border-radius: 99px; padding: 5px 8px; background: #142c28cc; color: #b5eadb; font-size: 10px; }
.profile-copy { padding: 19px 21px 8px; }
.profile-name { display: flex; align-items: baseline; gap: 7px; }
.profile-name h2 { margin: 0; font-size: 28px; }
.profile-name h2 { overflow-wrap: anywhere; }
.profile-name span { color: #9aaba7; font-size: 12px; }
.profile-bio { color: #d1dcd8; line-height: 1.55; }
.prompt-line { margin: 11px 0; border-left: 2px solid #d5a863; padding: 1px 0 1px 12px; color: #e3c99f; font-size: 13px; line-height: 1.5; }
.profile-actions { display: grid; grid-template-columns: .8fr 1.2fr .55fr; gap: 10px; padding: 14px 20px 20px; }
.safety-actions { display: flex; justify-content: center; gap: 20px; padding: 0 12px 17px; }
.safety-actions button, .chat-safety { border: 0; background: transparent; color: #9aa9a5; font-size: 10px; }
.chat-safety { padding: 6px 2px; color: #e4b46c; }
.profile-actions button, .secondary-button { min-height: 46px; border-radius: 8px; font-size: 13px; font-weight: 700; }
.pass-button { border: 1px solid #425554; background: transparent; color: #bdcac6; }
.spark-button { border: 0; background: #e4b46c; color: #15201d; }
.super-button { border: 1px solid #9d815c; border-radius: 8px; background: #30291f; color: #e4b46c; font-size: 20px; }
.spark-button span { margin-right: 6px; }
.privacy-caption { margin: 14px 0 0; color: #82928e; text-align: center; font-size: 11px; }
.empty-state { display: grid; min-height: 300px; align-content: center; justify-items: center; padding: 28px 22px; color: #a8b8b4; text-align: center; }
.empty-state h2, .unlocks-panel h2 { margin: 13px 0 4px; color: #eff3ee; font-size: 20px; }
.empty-state p, .unlocks-panel p { max-width: 400px; margin: 7px 0 15px; line-height: 1.55; }
.empty-star { color: #e4b46c; font-size: 30px; }
.text-button { border: 0; background: none; color: #85c9b9; font-size: 13px; font-weight: 700; }
.unlocks-panel { display: grid; min-height: 300px; justify-items: center; align-content: center; padding: 28px; border: 1px solid #2b3c3d; border-radius: 10px; background: #132122; text-align: center; }
.spark-orbit { display: grid; width: 78px; height: 78px; place-items: center; border: 1px solid #9d815c; border-radius: 50%; background: #30291f; color: #e4b46c; font-size: 30px; }
.secondary-button { border: 1px solid #658c80; padding: 0 17px; background: #24423d; color: #d8eee5; }
.tabbar { position: fixed; z-index: 6; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(5, 1fr); min-height: calc(65px + env(safe-area-inset-bottom)); padding: 7px max(8px, calc((100vw - 620px) / 2)) env(safe-area-inset-bottom); border-top: 1px solid #2b3c3d; background: #101c1df5; backdrop-filter: blur(18px); }
.tabbar button { position: relative; display: grid; justify-items: center; align-content: center; gap: 3px; border: 0; background: transparent; color: #829390; font-size: 10px; }
.tabbar button.active { color: #d9b879; }
.tab-symbol { font-size: 18px; line-height: 1; }
.tab-dot { position: absolute; top: 7px; right: 24%; width: 5px; height: 5px; border-radius: 50%; background: #e4b46c; }
.notice { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; border: 1px solid; border-radius: 8px; padding: 11px 13px; font-size: 12px; }
.error-notice { border-color: #8e5148; background: #351f1d; color: #ffd0c8; }
.success-notice { border-color: #547d70; background: #1d332e; color: #c7ebdd; }
.notice button { border: 0; background: transparent; color: inherit; font-weight: 700; }
.match-list { border-top: 1px solid #2a393a; }
.match-row { display: flex; width: 100%; align-items: center; gap: 12px; border: 0; border-bottom: 1px solid #2a393a; padding: 14px 3px; background: transparent; color: inherit; text-align: left; }
.mini-avatar { width: 46px; height: 46px; font-size: 16px; }
.match-copy { min-width: 0; flex: 1; }
.match-title { display: flex; justify-content: space-between; gap: 12px; }
.match-title strong { font-size: 14px; }
.match-title time, .match-copy p { color: #879894; font-size: 11px; }
.match-copy p { overflow: hidden; margin: 4px 0 0; text-overflow: ellipsis; white-space: nowrap; }
.row-arrow { color: #80918c; font-size: 23px; }
.chat-panel { display: flex; min-height: min(72svh, 720px); flex-direction: column; border: 1px solid #2b3c3d; border-radius: 10px; background: #121f20; }
.chat-header { display: flex; align-items: center; gap: 11px; border-bottom: 1px solid #2b3c3d; padding: 13px; }
.chat-header h1 { font-size: 16px; }
.chat-header p { margin: 3px 0 0; color: #8c9b97; font-size: 11px; }
.back-button, .refresh-button { border: 0; background: transparent; color: #d6e1dd; font-size: 20px; }
.refresh-button { margin-left: auto; }
.message-list { display: flex; min-height: 300px; flex: 1; flex-direction: column; gap: 9px; overflow-y: auto; padding: 14px; }
.chat-date { align-self: center; margin: 4px 0 12px; color: #80918d; font-size: 10px; }
.message { max-width: 82%; align-self: flex-start; border: 1px solid #354747; border-radius: 11px 11px 11px 3px; padding: 9px 11px 6px; background: #203332; }
.message.mine { align-self: flex-end; border-color: #4d766a; border-radius: 11px 11px 3px 11px; background: #29473f; }
.message p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; }
.message time { display: block; margin-top: 4px; color: #91a59e; text-align: right; font-size: 9px; }
.chat-start { align-self: center; max-width: 270px; margin: auto; color: #a2b3ae; text-align: center; font-size: 13px; line-height: 1.5; }
.composer { display: flex; gap: 8px; border-top: 1px solid #2b3c3d; padding: 10px; }
.composer input { min-width: 0; flex: 1; border: 1px solid #344748; border-radius: 8px; padding: 11px; background: #0d1718; color: #fff; outline: none; }
.composer button { border: 0; border-radius: 8px; padding: 0 12px; background: #d9ad6d; color: #18211e; font-size: 11px; font-weight: 750; }
.composer button:disabled { opacity: .55; }
.chat-footnote { margin: 0; padding: 0 12px 9px; color: #7d8c89; font-size: 9px; }
.level-chip { border: 1px solid #9d815c; border-radius: 99px; padding: 7px 10px; color: #e4c28b; font-size: 11px; }
.xp-panel { margin-bottom: 16px; border: 1px solid #344444; border-radius: 9px; padding: 15px; background: #132122; }
.xp-heading { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.xp-heading strong { color: #e4b46c; }
.xp-heading span { color: #91a19d; font-size: 11px; }
.xp-track { height: 7px; overflow: hidden; border-radius: 99px; background: #263738; }
.xp-track span { display: block; height: 100%; border-radius: inherit; background: #82c7b7; transition: width .3s ease; }
.quest-list { border-top: 1px solid #2b3c3d; }
.quest-progress { height: 4px; overflow: hidden; margin-top: 7px; border-radius: 4px; background: #263738; }
.quest-progress span { display: block; height: 100%; background: #82c7b7; }
.quest-row { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #2b3c3d; padding: 15px 0; }
.quest-star { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border: 1px solid #465451; border-radius: 50%; color: #758580; }
.quest-star.earned { border-color: #cba465; color: #e4b46c; }
.quest-copy { min-width: 0; flex: 1; }
.quest-copy h2 { margin: 0; font-size: 14px; }
.quest-copy p { margin: 4px 0 0; color: #91a19d; font-size: 11px; line-height: 1.45; }
.quest-reward { display: grid; justify-items: end; color: #e4b46c; }
.quest-reward strong { font-size: 13px; }
.quest-reward small, .quest-reward span { color: #8fa09a; font-size: 9px; }
.sky-heading { display: flex; align-items: center; gap: 15px; margin: 24px 0; }
.large-avatar { width: 76px; height: 76px; font-size: 24px; }
.sky-heading h1 { font-size: 24px; }
.sky-heading p { margin: 5px 0 0; color: #91a19d; font-size: 12px; }
.sky-section { border-top: 1px solid #2b3c3d; padding: 16px 0; }
.sky-section h2 { margin: 0 0 9px; color: #e4b46c; font-size: 13px; }
.sky-section p, .sky-section blockquote { margin: 0; color: #c5d0cc; font-size: 13px; line-height: 1.55; }
.sky-section blockquote { margin-top: 8px; border-left: 2px solid #59897b; padding-left: 10px; }
.wide-button { width: 100%; margin-top: 8px; }
.shop-actions { display: grid; gap: 8px; margin-top: 12px; }
.delete-account{display:block;margin:14px auto;border:1px solid #874f4b;border-radius:8px;background:transparent;color:#ff9c8f;padding:10px 14px;font-size:12px}.logout-button { display: block; margin: 16px auto; border: 0; background: transparent; color: #f29b8e; font-size: 12px; }
.modal-backdrop { position: fixed; z-index: 10; inset: 0; display: grid; place-items: center; padding: 18px; background: #071011cc; backdrop-filter: blur(6px); }
.report-dialog { width: min(100%, 420px); border: 1px solid #465a55; border-radius: 10px; padding: 21px; background: #142222; box-shadow: 0 24px 80px #0008; }
.report-dialog h2 { margin: 0 0 18px; font-size: 20px; }
.field-label { display: grid; gap: 7px; margin-bottom: 14px; color: #c9d5d1; font-size: 12px; }
.field-label select, .field-label textarea { width: 100%; border: 1px solid #344748; border-radius: 8px; padding: 11px; background: #0d1718; color: #f3f5f2; }
.field-label textarea { resize: vertical; }
.dialog-actions { display: flex; justify-content: end; gap: 8px; margin-top: 20px; }
.dialog-actions button { min-height: 40px; border-radius: 7px; padding: 0 11px; font-size: 11px; font-weight: 700; }
.cancel-button { border: 1px solid #475756; background: transparent; color: #c5d0cc; }
.send-report { border: 0; background: #d9ad6d; color: #18211e; }
@media (min-width: 760px) { .main-content { padding-top: 45px; } .profile-card { display: grid; grid-template-columns: 1.05fr .95fr; } .profile-photo { grid-row: span 2; min-height: 480px; aspect-ratio: auto; } .profile-copy { align-self: end; padding: 28px 24px 8px; } .profile-actions { align-self: start; } }
@media (max-width: 450px) { .main-content { padding: 23px 14px; } .topbar { padding: 0 15px; } .orbit-date { font-size: 10px; } .profile-photo { min-height: 250px; } .xp-heading { align-items: start; flex-direction: column; gap: 4px; } }
</style>