<script setup lang="ts">
import { ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  busy?: boolean
  error?: string
  showTelegram?: boolean
  notice?: string
  showResendVerification?: boolean
}>()

const emit = defineEmits<{
  submit: [data: { mode: 'login' | 'register'; email: string; password: string; confirmPassword: string; acceptedTerms: boolean }]
  telegram: []
  forgot: []
  resendVerification: []
}>()

const { t } = useLocale()
const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const acceptedTerms = ref(false)
const localError = ref('')

const submit = () => {
  localError.value = ''
  if (mode.value === 'register') {
    if (password.value !== confirmPassword.value) {
      localError.value = t('auth.passwordMismatch')
      return
    }
    if (!acceptedTerms.value) return
  }
  if (new TextEncoder().encode(password.value).length > 72) {
    localError.value = t('auth.passwordTooLong')
    return
  }

  emit('submit', {
    mode: mode.value,
    email: email.value.trim(),
    password: password.value,
    confirmPassword: confirmPassword.value,
    acceptedTerms: acceptedTerms.value,
  })
}
</script>

<template>
  <main class="auth-shell">
    <div class="auth-topline">
      <a class="brand" href="#home"><span>✦</span> constella</a>
      <LanguageSwitcher />
    </div>

    <section class="auth-panel">
      <p class="eyebrow">{{ t('auth.eyebrow') }}</p>
      <h1>{{ t(mode === 'login' ? 'auth.titleLogin' : 'auth.titleRegister') }}</h1>
      <p class="auth-subtitle">{{ t(props.showTelegram ? 'auth.subtitle' : 'auth.subtitleWeb') }}</p>

      <button v-if="props.showTelegram" class="telegram-button" type="button" @click="emit('telegram')">
        <span class="telegram-mark">➤</span>{{ t('auth.telegram') }}
      </button>

      <div v-if="props.showTelegram" class="divider"><span>{{ t('auth.divider') }}</span></div>

      <form class="auth-form" @submit.prevent="submit">
        <label class="field">
          <span>{{ t('auth.email') }}</span>
          <input v-model.trim="email" type="email" maxlength="254" autocomplete="email" required>
        </label>

        <label class="field">
          <span>{{ t('auth.password') }}</span>
          <input
            v-model="password"
            type="password"
            :minlength="mode === 'register' ? 12 : 1"
            maxlength="72"
            :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
            required
          >
          <small v-if="mode === 'register'">{{ t('auth.passwordHint') }}</small>
        </label>

        <label v-if="mode === 'register'" class="field">
          <span>{{ t('auth.confirmPassword') }}</span>
          <input v-model="confirmPassword" type="password" minlength="12" maxlength="72" autocomplete="new-password" required>
        </label>

        <label v-if="mode === 'register'" class="consent">
          <input v-model="acceptedTerms" type="checkbox" required>
          <span>{{ t('auth.acceptTerms') }}</span>
        </label>

        <p v-if="localError || props.error" class="form-error" role="alert">{{ localError || props.error }}</p>
        <p v-if="props.notice" class="form-notice" role="status">{{ props.notice }}</p>
        <button class="submit-button" type="submit" :disabled="busy">
          {{ busy ? t('profile.saving') : t(mode === 'login' ? 'auth.submitLogin' : 'auth.submitRegister') }}
        </button>
      </form>

      <div v-if="mode === 'login'" class="account-help">
        <button type="button" @click="emit('forgot')">{{ t('auth.forgotPassword') }}</button>
        <button v-if="showResendVerification" type="button" @click="emit('resendVerification')">{{ t('auth.resendVerification') }}</button>
      </div>
      <button class="mode-switch" type="button" @click="mode = mode === 'login' ? 'register' : 'login'; localError = ''">
        {{ t(mode === 'login' ? 'auth.switchToRegister' : 'auth.switchToLogin') }}
      </button>
    </section>
    <p class="auth-footnote">{{ t('profile.privacy') }}</p>
  </main>
</template>

<style scoped>
.auth-shell { min-height: 100svh; padding: 17px 20px 38px; background: radial-gradient(ellipse at 50% 0%, #1b3631 0%, #0d1718 56%); color: #f3f5f2; }
.auth-topline { display: flex; width: min(100%, 960px); height: 43px; align-items: center; justify-content: space-between; margin: 0 auto; }
.brand { display: inline-flex; align-items: center; gap: 9px; color: #f3f5f2; font-size: 17px; font-weight: 800; text-decoration: none; }
.brand span { color: #e4b46c; font-size: 22px; }
.auth-panel { width: min(100%, 440px); margin: clamp(34px, 8vh, 75px) auto 0; border: 1px solid #314343; border-radius: 10px; padding: clamp(22px, 6vw, 34px); background: #132122ee; box-shadow: 0 28px 90px #0003; }
.eyebrow { margin: 0 0 13px; color: #85c9b9; font-size: 9px; font-weight: 750; letter-spacing: .12em; }
h1 { margin: 0; font-size: 30px; line-height: 1.15; }
.auth-subtitle { margin: 10px 0 23px; color: #aab9b6; font-size: 13px; line-height: 1.55; }
.telegram-button, .submit-button { display: flex; width: 100%; min-height: 46px; align-items: center; justify-content: center; gap: 9px; border: 0; border-radius: 8px; font-size: 13px; font-weight: 750; }
.telegram-button { background: #2b7f9f; color: white; }
.telegram-mark { font-size: 17px; }
.divider { display: flex; align-items: center; gap: 11px; margin: 20px 0; color: #879995; font-size: 11px; }
.divider::before, .divider::after { height: 1px; flex: 1; background: #304142; content: ''; }
.auth-form { display: grid; gap: 14px; }
.field { display: grid; gap: 7px; color: #d4dfdc; font-size: 12px; }
.field small { color: #83938f; font-size: 10px; }
.field input { width: 100%; min-height: 43px; border: 1px solid #344748; border-radius: 7px; padding: 10px 12px; background: #0d1718; color: #f5f7f6; outline: none; }
.field input:focus { border-color: #82c7b7; box-shadow: 0 0 0 2px #82c7b722; }
.consent { display: flex; align-items: start; gap: 9px; color: #bdcbc7; font-size: 11px; line-height: 1.45; }
.consent input { width: 16px; height: 16px; flex: 0 0 auto; margin: 1px 0 0; accent-color: #82c7b7; }
.form-error { margin: 0; color: #ff9c8f; font-size: 12px; line-height: 1.5; }
.form-notice { margin: 0; color: #9bd5c5; font-size: 12px; line-height: 1.5; }
.account-help { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; margin-top: 14px; }
.account-help button { border: 0; padding: 0; background: transparent; color: #9bd5c5; font-size: 11px; }
.submit-button { margin-top: 3px; background: #d9ad6d; color: #18211e; }
.submit-button:disabled { cursor: wait; opacity: .6; }
.mode-switch { display: block; margin: 17px auto 0; border: 0; background: transparent; color: #9bd5c5; font-size: 11px; }
.auth-footnote { max-width: 440px; margin: 16px auto 0; color: #82928e; text-align: center; font-size: 10px; line-height: 1.5; }
@media (max-width: 420px) { .auth-shell { padding-right: 14px; padding-left: 14px; } .auth-panel { margin-top: 28px; } }
</style>
