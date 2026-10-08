<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

const route = useRoute()
const config = useRuntimeConfig()
const { t } = useLocale()
const busy = ref(false)
const error = ref('')
const done = ref(false)
const password = ref('')
const confirmPassword = ref('')
const isVerification = computed(() => route.path === '/auth/verify')
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const apiBase = (config.public.apiBase || '/api').replace(/\/$/, '')

const post = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result?.error || t('auth.actionExpired'))
}
const verify = async () => {
  if (!token.value) { error.value = t('auth.actionExpired'); return }
  busy.value = true
  try {
    await post('/auth/web/verification/complete', { token: token.value })
    done.value = true
  } catch (cause: any) { error.value = cause?.message || t('auth.actionExpired') }
  finally { busy.value = false }
}
const resetPassword = async () => {
  error.value = ''
  if (password.value !== confirmPassword.value) { error.value = t('auth.passwordMismatch'); return }
  if (!token.value) { error.value = t('auth.actionExpired'); return }
  busy.value = true
  try {
    await post('/auth/web/password-reset/complete', {
      token: token.value, password: password.value, confirmPassword: confirmPassword.value,
    })
    done.value = true
  } catch (cause: any) { error.value = cause?.message || t('auth.actionExpired') }
  finally { busy.value = false }
}
onMounted(() => { if (isVerification.value) void verify() })
</script>

<template>
  <main class="action-shell">
    <a class="brand" href="/">✦ constella</a>
    <section class="action-card">
      <p class="eyebrow">CONSTELLA · БЕЗПЕКА АКАУНТА</p>
      <template v-if="done">
        <div class="success-mark">✓</div>
        <h1>{{ t(isVerification ? 'auth.verifySuccess' : 'auth.resetSuccess') }}</h1>
        <button class="primary" type="button" @click="navigateTo('/')">{{ t('auth.submitLogin') }}</button>
      </template>
      <template v-else-if="isVerification">
        <h1>{{ t('auth.checkInbox') }}</h1>
        <p v-if="busy">{{ t('profile.saving') }}</p>
        <p v-else-if="error" class="error" role="alert">{{ error }}</p>
        <button v-if="!busy" class="primary" type="button" @click="navigateTo('/')">{{ t('auth.submitLogin') }}</button>
      </template>
      <template v-else>
        <h1>{{ t('auth.resetTitle') }}</h1>
        <p>{{ t('auth.resetIntro') }}</p>
        <form @submit.prevent="resetPassword">
          <label>{{ t('auth.password') }}<input v-model="password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>
          <label>{{ t('auth.confirmPassword') }}<input v-model="confirmPassword" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button class="primary" type="submit" :disabled="busy">{{ busy ? t('profile.saving') : t('auth.resetSubmit') }}</button>
        </form>
      </template>
    </section>
  </main>
</template>

<style scoped>
.action-shell{min-height:100svh;padding:24px 18px;background:radial-gradient(ellipse at 50% 0%,#1b3631 0%,#0d1718 58%);color:#f3f5f2;font-family:Manrope,system-ui,sans-serif}.brand{display:block;width:min(100%,680px);margin:auto;color:#f3f5f2;text-decoration:none;font-weight:800}.brand:first-letter{color:#e4b46c}.action-card{width:min(100%,460px);margin:clamp(48px,12vh,100px) auto 0;border:1px solid #314343;border-radius:16px;padding:clamp(22px,6vw,36px);background:#132122ee}.eyebrow{color:#85c9b9;font-size:10px;letter-spacing:.14em;font-weight:750}.action-card h1{font-size:clamp(24px,5vw,32px);line-height:1.2}.action-card p{color:#aab9b6;line-height:1.6}.action-card form{display:grid;gap:16px}.action-card label{display:grid;gap:7px;color:#d4dfdc;font-size:13px}.action-card input{min-height:46px;border:1px solid #344748;border-radius:8px;padding:12px;background:#0d1718;color:#fff}.primary{width:100%;min-height:46px;margin-top:12px;border:0;border-radius:8px;background:#d9ad6d;color:#18211e;font-weight:750}.primary:disabled{opacity:.6}.error{color:#ff9c8f!important}.success-mark{display:grid;width:42px;height:42px;place-items:center;border-radius:50%;background:#284c41;color:#9ce2c7;font-size:24px}
</style>
