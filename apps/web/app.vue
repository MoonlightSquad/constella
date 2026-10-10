<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useLocale } from '~/composables/useLocale'

const { $trpc } = useNuxtApp() as any
const config = useRuntimeConfig()
const { t } = useLocale()
const route = useRoute()
const isAdmin = ref(false)

const account = ref<Record<string, any> | null>(null)
const isLoading = ref(true)
const isSaving = ref(false)
const needsProfileSetup = ref(false)
const isEditingProfile = ref(false)
const error = ref('')
const authNotice = ref('')
const showResendVerification = ref(false)
const telegramAvailable = ref(false)

const apiBase = () => (config.public.apiBase || '/api').replace(/\/$/, '')

const loadAccount = async () => {
  account.value = await $trpc.me.query()
  isAdmin.value = (await $trpc.admin.access.query().catch(() => ({ isAdmin: false }))).isAdmin
  needsProfileSetup.value = !isAdmin.value && !account.value?.onboardingComplete
}

onMounted(async () => {
  const telegram = window.Telegram?.WebApp
  telegramAvailable.value = Boolean(telegram?.initData)

  if (!telegram?.initData) {
    const savedToken = localStorage.getItem('constella_token')
    if (savedToken) {
      try {
        await loadAccount()
        isLoading.value = false
        return
      } catch {
        localStorage.removeItem('constella_token')
      }
    }
    isLoading.value = false
    return
  }

  try {
    telegram.ready()
    telegram.expand()
    const response = await fetch(`${apiBase()}/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: telegram.initData }),
    })
    const rawBody = await response.text()
    let result: any = null
    try {
      result = rawBody ? JSON.parse(rawBody) : null
    } catch {
      throw new Error(t('app.apiInvalid', { status: response.status }))
    }

    if (!response.ok) {
      throw new Error(result?.details || result?.error || t('app.authError', { status: response.status }))
    }
    if (!result?.token) {
      throw new Error(t('app.tokenMissing'))
    }

    localStorage.setItem('constella_token', result.token)
    await loadAccount()
  } catch (cause: any) {
    console.error('Constella startup failed:', cause)
    const message = cause?.message || t('auth.genericError')
    error.value = message.includes('Failed to fetch')
      ? t('app.apiOffline')
      : message
  } finally {
    isLoading.value = false
  }
})

const saveProfile = async (profile: Record<string, unknown>) => {
  isSaving.value = true
  error.value = ''
  try {
    await $trpc.completeProfile.mutate(profile)
    await loadAccount()
    isEditingProfile.value = false
  } catch (cause: any) {
    error.value = cause?.message || t('app.saveFailed')
  } finally {
    isSaving.value = false
  }
}

const logout = () => {
  localStorage.removeItem('constella_token')
  account.value = null
  isAdmin.value = false
  needsProfileSetup.value = false
  error.value = ''
}

const adminLogin = async (credentials: { email: string; password: string }) => {
  error.value = ''
  isSaving.value = true
  try {
    const response = await fetch(`${apiBase()}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    const result = await response.json()
    if (!response.ok) {
      if (response.status === 429) throw new Error(t('auth.rateLimited'))
      throw new Error(result?.error || 'Не вдалося увійти до адмінки.')
    }
    if (!result?.token) throw new Error(t('app.tokenMissing'))

    localStorage.setItem('constella_token', result.token)
    try {
      await loadAccount()
      if (!isAdmin.value) throw new Error('Доступ до адмінки не надано.')
    } catch (cause) {
      localStorage.removeItem('constella_token')
      account.value = null
      isAdmin.value = false
      throw cause
    }
  } catch (cause: any) {
    error.value = cause?.message || 'Не вдалося увійти до адмінки.'
  } finally {
    isSaving.value = false
  }
}

const webAuth = async (credentials: {
  mode: 'login' | 'register'
  email: string
  password: string
  confirmPassword: string
  acceptedTerms: boolean
}) => {
  error.value = ''
  authNotice.value = ''
  showResendVerification.value = false
  isSaving.value = true
  try {
    const endpoint = credentials.mode === 'register' ? '/auth/web/register' : '/auth/web/login'
    const body = credentials.mode === 'register'
      ? { email: credentials.email, password: credentials.password, confirmPassword: credentials.confirmPassword, acceptedTerms: credentials.acceptedTerms }
      : { email: credentials.email, password: credentials.password }
    const response = await fetch(`${apiBase()}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) {
      if (response.status === 409) throw new Error(t('auth.emailExists'))
      if (response.status === 401) throw new Error(t('auth.loginError'))
      if (result?.code === 'EMAIL_NOT_VERIFIED') {
        showResendVerification.value = true
        throw new Error(t('auth.verifyFirst'))
      }
      if (response.status === 429) throw new Error(t('auth.rateLimited'))
      throw new Error(credentials.mode === 'register' ? t('auth.registerError') : t('auth.genericError'))
    }
    if (credentials.mode === 'register' && result?.emailVerificationRequired) {
      authNotice.value = t('auth.checkInbox')
      return
    }
    if (!result?.token) throw new Error(t('app.tokenMissing'))

    localStorage.setItem('constella_token', result.token)
    await loadAccount()
  } catch (cause: any) {
    const message = cause?.message || ''
    error.value = message.includes('Failed to fetch') ? t('app.apiOffline') : message || t('auth.genericError')
  } finally {
    isSaving.value = false
  }
}

const authAction = async (path: string, email: string) => {
  authNotice.value = ''
  error.value = ''
  isSaving.value = true
  try {
    const response = await fetch(`${apiBase()}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    })
    if (!response.ok) throw new Error(t('auth.genericError'))
    authNotice.value = t(path.includes('reset') ? 'auth.resetSent' : 'auth.verificationSent')
  } catch (cause: any) {
    error.value = cause?.message || t('auth.genericError')
  } finally {
    isSaving.value = false
  }
}
const requestPasswordReset = () => {
  const email = window.prompt(t('auth.enterEmail'))
  if (email?.trim()) void authAction('/auth/web/password-reset/request', email.trim())
}
const resendVerification = () => {
  const email = window.prompt(t('auth.enterEmail'))
  if (email?.trim()) void authAction('/auth/web/verification/resend', email.trim())
}

const deleteAccount = async () => {
  if (!window.confirm('Видалити акаунт і пов’язані дані? Цю дію не можна скасувати.')) return
  const telegram = window.Telegram?.WebApp
  const password = telegram?.initData ? undefined : window.prompt('Підтвердіть видалення паролем:')
  if (!telegram?.initData && !password) return
  try {
    const response = await fetch(`${apiBase()}/auth/account/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('constella_token')}` },
      body: JSON.stringify({ confirm: 'DELETE', ...(password ? { password } : {}), ...(telegram?.initData ? { initData: telegram.initData } : {}) }),
    })
    if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Не вдалося видалити акаунт.') }
    logout()
    authNotice.value = 'Акаунт та пов’язані персональні дані видалено.'
  } catch (cause: any) { error.value = cause?.message || 'Не вдалося видалити акаунт.' }
}
const retry = () => window.location.reload()

watch(
  [() => route.path, isLoading, isAdmin],
  ([path, loading, admin]) => {
    if (loading) return
    if (path === '/admin' && !admin) navigateTo('/admin/login', { replace: true })
    if (path === '/admin/login' && admin) navigateTo('/admin', { replace: true })
  },
  { immediate: true }
)
</script>

<template>
  <div class="app-frame">
    <div v-if="isLoading" class="startup-state">
      <div class="startup-mark">✦</div>
      <p>{{ t('app.starting') }}</p>
      <LanguageSwitcher />
    </div>

    <AuthAction v-else-if="route.path.startsWith('/auth/')" />
    <AdminAuth
      v-else-if="route.path === '/admin/login'"
      :busy="isSaving"
      :error="error"
      @submit="adminLogin"
      @exit="navigateTo('/')"
    />
    <AdminConsole
      v-else-if="route.path === '/admin' && isAdmin"
      @exit="navigateTo('/')"
      @logout="logout(); navigateTo('/admin/login')"
    />
    <div v-else-if="route.path === '/admin'" class="startup-state" role="status">
      <div class="startup-mark">✦</div>
      <p>Перевіряємо доступ до адмінпанелі…</p>
    </div>
    <WebAuth
      v-else-if="!account"
      :busy="isSaving"
      :error="error"
      :notice="authNotice"
      :show-resend-verification="showResendVerification"
      :show-telegram="telegramAvailable"
      @submit="webAuth"
      @forgot="requestPasswordReset"
      @resend-verification="resendVerification"
      @telegram="retry"
    />

    <ProfileSetup
      v-else-if="account && (needsProfileSetup || isEditingProfile)"
      :initial="account"
      :busy="isSaving"
      :can-cancel="isEditingProfile && !needsProfileSetup"
      :error="error"
      @save="saveProfile"
      @cancel="isEditingProfile = false; error = ''"
    />

    <ConstellaDashboard
      v-else-if="account"
      :account="account"
      :is-admin="isAdmin"
      @open-admin="navigateTo('/admin')"
      @edit-profile="isEditingProfile = true"
      @logout="logout"
      @delete-account="deleteAccount"
    />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

:root { color-scheme: dark; font-family: 'Manrope', sans-serif; font-synthesis: none; }
* { box-sizing: border-box; }
html, body, #__nuxt { min-height: 100%; margin: 0; }
body { min-width: 320px; background: #0d1718; color: #f3f5f2; }
button, input, textarea, select { font: inherit; }
button { cursor: pointer; }
.app-frame { min-height: 100svh; }
.startup-state, .error-state { display: grid; min-height: 100svh; align-content: center; justify-items: center; padding: 28px; text-align: center; }
.startup-mark, .error-mark { display: grid; width: 64px; height: 64px; place-items: center; border: 1px solid #617c70; border-radius: 50%; color: #e4b46c; font-size: 27px; }
.startup-state p { color: #a9b9b4; font-size: 13px; }
.error-mark { border-color: #a55e51; color: #f29b8e; font-size: 20px; }
.error-state .eyebrow { margin: 22px 0 9px; color: #e4b46c; font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.error-state h1 { max-width: 400px; margin: 0; font-size: 28px; }
.error-message { max-width: 460px; margin: 13px 0 20px; color: #a9b9b4; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.error-state button { min-height: 44px; border: 0; border-radius: 8px; padding: 0 18px; background: #d9ad6d; color: #15201d; font-size: 13px; font-weight: 750; }
</style>