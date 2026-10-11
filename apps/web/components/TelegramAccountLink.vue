<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

declare global {
  interface Window {
    onConstellaTelegramAuth?: (payload: Record<string, string | number | boolean>) => void
  }
}

const props = defineProps<{
  botUsername: string
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{
  authenticate: [payload: Record<string, string | number | boolean>]
}>()

const widgetError = ref('')
let widgetScript: HTMLScriptElement | null = null
const telegramAuthCallback = (payload: Record<string, string | number | boolean>) => {
  widgetError.value = ''
  emit('authenticate', payload)
}

onMounted(() => {
  const botUsername = props.botUsername.trim().replace(/^@/, '')
  if (!botUsername) return

  window.onConstellaTelegramAuth = telegramAuthCallback
  widgetScript = document.createElement('script')
  widgetScript.async = true
  widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22'
  widgetScript.dataset.telegramLogin = botUsername
  widgetScript.dataset.size = 'large'
  widgetScript.dataset.userpic = 'false'
  widgetScript.dataset.onauth = 'onConstellaTelegramAuth(user)'
  widgetScript.onerror = () => {
    widgetError.value = 'Не вдалося завантажити кнопку Telegram. Перевірте блокувальник скриптів і спробуйте ще раз.'
  }
  document.getElementById('telegram-account-link-widget')?.append(widgetScript)
})

onBeforeUnmount(() => {
  widgetScript?.remove()
  delete window.onConstellaTelegramAuth
})
</script>

<template>
  <div class="telegram-link">
    <div v-if="busy" class="telegram-loading" role="status">Підтверджуємо Telegram-акаунт…</div>
    <div v-else-if="botUsername" id="telegram-account-link-widget" class="telegram-widget" />
    <p v-else class="telegram-error">Вхід через Telegram тимчасово не налаштований.</p>
    <p v-if="error || widgetError" class="telegram-error" role="alert">{{ error || widgetError }}</p>
  </div>
</template>

<style scoped>
.telegram-link{display:grid;gap:9px;align-content:start}
.telegram-widget{min-height:42px}
.telegram-loading,.telegram-error{margin:0;color:#aab9b6;font-size:12px;line-height:1.5}
.telegram-error{color:#ff9c8f}
</style>
