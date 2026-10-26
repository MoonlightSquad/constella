<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'

defineProps<{
  message: { body: string }
  shown: string | null | undefined
}>()

const { t } = useLocale()
</script>

<template>
  <p v-if="shown === 'call'" class="call-banner">
    📞 {{ message.body.includes('video') ? t('dashboard.videoCall') : t('dashboard.audioCall') }}
  </p>
  <p v-else>{{ message.body }}</p>
</template>

<style scoped>
.call-banner { margin: 0; padding: 4px 8px; border-radius: 6px; background: #223c36; color: #a2e8d7; font-size: 12px; font-weight: 600; }
p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; }
</style>
