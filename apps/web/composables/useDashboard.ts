import { computed } from 'vue'
import { useLocale } from '~/composables/useLocale'

export type Tab = 'orbit' | 'sparks' | 'chats' | 'quests' | 'sky'

export interface DashProfile {
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

export interface DashMatch {
  id: string
  createdAt: string
  profile: DashProfile | null
  lastMessage: { body: string; kind: string | null; sentByMe: boolean; createdAt: string } | null
}

// Shared, route-persistent state for the dashboard tab pages + layout.
// Uses Nuxt `useState` so the frame (layout) and each page read the same refs
// without a store library. Data is loaded once by the layout and reused while
// navigating between tabs.
export const TAB_ROUTES: Record<Tab, string> = {
  orbit: '/',
  sparks: '/sparks',
  chats: '/chats',
  quests: '/quests',
  sky: '/sky',
}

const PATH_TO_TAB: Record<string, Tab> = {
  '/': 'orbit',
  '/sparks': 'sparks',
  '/chats': 'chats',
  '/quests': 'quests',
  '/sky': 'sky',
  '/support': 'sky',
}

export function useDashboard() {
  const { $trpc } = useNuxtApp() as any
  const config = useRuntimeConfig()
  const route = useRoute()
  const { locale, t } = useLocale()

  // --- Auth / session (set by app.vue) ---
  const account = useState<Record<string, any> | null>('dash:account', () => null)
  const isAdmin = useState<boolean>('dash:isAdmin', () => false)
  const editingProfile = useState<boolean>('dash:editingProfile', () => false)

  // --- Shared dashboard data ---
  const supportOpen = useState<boolean>('dash:supportOpen', () => false)
  const orbitProfiles = useState<DashProfile[]>('dash:orbitProfiles', () => [])
  const matches = useState<DashMatch[]>('dash:matches', () => [])
  const quests = useState<{ xp: number; level: number; achievements: any[]; daily: any[]; referralCode?: string | null; botUsername?: string | null } | null>('dash:quests', () => null)
  const billingStatus = useState<any>('dash:billingStatus', () => null)
  const appliedOrbitFilters = useState<Record<string, string | number>>('dash:appliedFilters', () => ({}))
  const isBuying = useState<string | null>('dash:isBuying', () => null)
  const isLinkingTelegram = useState<boolean>('dash:isLinkingTelegram', () => false)
  const telegramLinkError = useState<string>('dash:telegramLinkError', () => '')
  const awaitingBrowserPayment = useState<boolean>('dash:awaitingPayment', () => false)
  const incomingSparks = useState<number>('dash:incomingSparks', () => 0)
  const incomingLikes = useState<{ count: number; vip: boolean; profiles: DashProfile[] } | null>('dash:incomingLikes', () => null)
  const orbitRemaining = useState<number>('dash:orbitRemaining', () => 0)
  const orbitDate = useState<string>('dash:orbitDate', () => '')
  const releasePending = useState<boolean>('dash:releasePending', () => false)
  const isLoading = useState<boolean>('dash:isLoading', () => true)
  const toast = useState<string>('dash:toast', () => '')
  const issue = useState<string>('dash:issue', () => '')
  const safetyTarget = useState<{ profileId: string; matchId?: string; label: string } | null>('dash:safetyTarget', () => null)
  const reportReason = useState<string>('dash:reportReason', () => 'spam')
  const reportDetails = useState<string>('dash:reportDetails', () => '')

  const currentProfile = computed(() => orbitProfiles.value[0] ?? null)

  // --- Navigation (real router pages per tab) ---
  const activeTab = computed<Tab>(() => PATH_TO_TAB[route.path] ?? 'orbit')
  const goTab = (tab: Tab) => {
    const target = TAB_ROUTES[tab]
    if (route.path !== target) void navigateTo(target)
  }

  const showError = (error: any) => { issue.value = error?.message || t('dashboard.loadError') }
  const showToast = (msg: string) => {
    toast.value = msg
    window.setTimeout(() => { toast.value = '' }, 3600)
  }

  // --- Loaders ---
  const loadOrbit = async (filters = appliedOrbitFilters.value) => {
    const result = await $trpc.social.orbit.query(filters)
    orbitProfiles.value = result.profiles
    orbitRemaining.value = result.remaining
    orbitDate.value = result.date
    releasePending.value = result.releasePending
  }

  const applyOrbitFilters = async (filters: Record<string, string | number>) => {
    appliedOrbitFilters.value = filters
    isLoading.value = true
    issue.value = ''
    try { await loadOrbit() } catch (error) { showError(error) } finally { isLoading.value = false }
  }

  const clearOrbitFilters = async () => {
    appliedOrbitFilters.value = {}
    isLoading.value = true
    issue.value = ''
    try { await loadOrbit() } catch (error) { showError(error) } finally { isLoading.value = false }
  }

  const loadMatches = async () => { matches.value = await $trpc.social.matches.query() }
  const loadQuests = async () => { quests.value = await $trpc.social.quests.query() }
  const completeInviteQuest = async () => {
    try {
      await $trpc.social.completeInviteQuest.mutate()
      await loadQuests()
    } catch (error) { showError(error) }
  }
  const loadBilling = async () => { billingStatus.value = await $trpc.billing.status.query() }
  const loadSparks = async () => {
    // The blurred «who liked you» payload is cheaper to refresh together with the
    // badge count — both drive the Sparks tab.
    const [sparks, likes] = await Promise.all([
      $trpc.social.incomingSparks.query(),
      $trpc.social.incomingLikes.query(),
    ])
    incomingSparks.value = sparks.count
    incomingLikes.value = likes
  }

  const likeIncomingProfile = async (profileId: string) => {
    try {
      const result = await $trpc.social.swipe.mutate({ profileId, kind: 'spark' })
      if (result.matched) {
        showToast(t('dashboard.matchToast'))
        await Promise.all([loadMatches(), loadQuests()])
        goTab('chats')
      }
      await Promise.all([loadOrbit(), loadSparks()])
    } catch (error) { showError(error) }
  }

  const refreshAll = async () => {
    isLoading.value = true
    issue.value = ''
    try {
      await Promise.all([loadOrbit(), loadMatches(), loadQuests(), loadSparks(), loadBilling()])
    } catch (error) { showError(error) } finally { isLoading.value = false }
  }

  const reactToProfile = async (kind: 'spark' | 'pass' | 'super') => {
    const profile = currentProfile.value
    if (!profile) return
    try {
      const result = await $trpc.social.swipe.mutate({ profileId: profile.id, kind })
      if (result.matched) {
        showToast(t('dashboard.matchToast'))
        await Promise.all([loadMatches(), loadQuests()])
        goTab('chats')
      }
      // Liking someone back from Orbit removes them from the pending likes list.
      await Promise.all([loadOrbit(), loadSparks()])
    } catch (error) { showError(error) }
  }

  const requestConfirmation = (message: string) => new Promise<boolean>((resolve) => {
    const telegram = (window as any).Telegram?.WebApp
    if (telegram?.showConfirm) telegram.showConfirm(message, resolve)
    else resolve(window.confirm(message))
  })

  const blockProfile = async (profileId: string) => {
    if (!(await requestConfirmation(t('dashboard.blockConfirm')))) return
    try {
      await $trpc.social.blockProfile.mutate({ profileId })
      safetyTarget.value = null
      showToast(t('dashboard.blocked'))
      await refreshAll()
    } catch (error) { showError(error) }
  }

  const openReport = (profile: DashProfile, matchId?: string) => {
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
      showToast(t('dashboard.reportThanks'))
      safetyTarget.value = null
    } catch (error) { showError(error) }
  }

  const linkTelegramAccount = async (payload: Record<string, string | number | boolean>) => {
    isLinkingTelegram.value = true
    telegramLinkError.value = ''
    issue.value = ''
    try {
      await $trpc.billing.linkTelegram.mutate(payload)
      await loadBilling()
      showToast(t('dashboard.telegramLinked'))
    } catch (error: any) {
      telegramLinkError.value = error?.message || t('dashboard.telegramLinkFailed')
    } finally { isLinkingTelegram.value = false }
  }

  const cancelVip = async () => {
    if (!(await requestConfirmation(t('dashboard.cancelVipConfirm')))) return
    try {
      await $trpc.billing.cancelSubscription.mutate()
      await loadBilling()
      showToast(t('dashboard.cancelVipDone'))
    } catch (error) { showError(error) }
  }

  const buyProduct = async (sku: string) => {
    if (isBuying.value || !billingStatus.value?.telegramAvailable) return
    const telegram = (window as any).Telegram?.WebApp
    const invoiceWindow = telegram?.openInvoice ? null : window.open('about:blank', '_blank')
    if (invoiceWindow) invoiceWindow.opener = null
    isBuying.value = sku
    try {
      const invoice = await $trpc.billing.createInvoice.mutate({ sku })
      if (telegram?.openInvoice) {
        telegram.openInvoice(invoice.invoiceLink, async (status: string) => {
          if (status === 'paid') { showToast(t('dashboard.paymentConfirmed')); await Promise.all([loadBilling(), loadOrbit()]) }
          else if (status === 'pending') { showToast(t('dashboard.paymentProcessing')); window.setTimeout(() => { void loadBilling() }, 2500) }
          else if (status === 'failed') { showError(new Error(t('dashboard.paymentFailed'))) }
        })
      } else if (invoiceWindow) {
        invoiceWindow.location.href = invoice.invoiceLink
        awaitingBrowserPayment.value = true
      } else {
        window.location.assign(invoice.invoiceLink)
      }
    } catch (error) {
      invoiceWindow?.close()
      showError(error)
    } finally { isBuying.value = null }
  }

  const refreshAfterBrowserPayment = () => {
    if (!awaitingBrowserPayment.value || document.visibilityState !== 'visible') return
    awaitingBrowserPayment.value = false
    window.setTimeout(async () => {
      try {
        await Promise.all([loadBilling(), loadOrbit()])
        showToast(t('dashboard.purchaseStatusUpdated'))
      } catch (error) { showError(error) }
    }, 1500)
  }

  // --- Session-level actions (provided by app.vue) ---
  const authActions = useState<{ logout?: () => void; deleteAccount?: () => void }>('dash:authActions', () => ({}))
  const openAdmin = () => { void navigateTo('/admin') }
  const requestEditProfile = () => { editingProfile.value = true }

  const localeTag: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }
  const formatOrbitDate = (date: string) =>
    new Intl.DateTimeFormat(localeTag[locale.value], { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))

  void config
  return {
    // session
    account, isAdmin, editingProfile,
    // data
    supportOpen, orbitProfiles, matches, quests, billingStatus, incomingSparks, incomingLikes,
    orbitRemaining, orbitDate, releasePending, isLoading, isBuying,
    isLinkingTelegram, telegramLinkError, currentProfile,
    // notices + report
    toast, issue, safetyTarget, reportReason, reportDetails,
    // nav
    activeTab, goTab,
    // actions
    showError, showToast, refreshAll, loadOrbit, applyOrbitFilters, clearOrbitFilters,
    loadMatches, loadQuests, loadBilling, loadSparks, reactToProfile, likeIncomingProfile, blockProfile,
    openReport, submitReport, linkTelegramAccount, cancelVip, buyProduct,
    refreshAfterBrowserPayment, formatOrbitDate, openAdmin, requestEditProfile,
    completeInviteQuest, authActions,
  }
}
