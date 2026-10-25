<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'

defineProps<{
  activeCall: { callType: 'audio' | 'video'; peerName: string } | null
  incomingCall: { callType: 'audio' | 'video'; fromName: string } | null
  callTimer: number
}>()

const emit = defineEmits<{
  accept: []
  decline: []
  end: []
}>()

const { t } = useLocale()

const formatCallTime = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div v-if="incomingCall" class="modal-backdrop">
    <div class="call-modal">
      <div class="call-avatar">✦</div>
      <h2>{{ incomingCall.fromName }}</h2>
      <p class="call-subtitle">{{ t('dashboard.callIncoming') }} · {{ incomingCall.callType === 'video' ? t('dashboard.videoCall') : t('dashboard.audioCall') }}</p>
      <div class="call-actions call-actions--pair">
        <button class="decline-call-button" type="button" @click="emit('decline')">{{ t('dashboard.callDecline') }}</button>
        <button class="accept-call-button" type="button" @click="emit('accept')">{{ t('dashboard.callAccept') }}</button>
      </div>
    </div>
  </div>

  <div v-else-if="activeCall" class="modal-backdrop" @click.self="emit('end')">
    <div class="call-modal">
      <div class="call-avatar">✦</div>
      <h2>{{ activeCall.peerName }}</h2>
      <p class="call-subtitle">{{ activeCall.callType === 'video' ? t('dashboard.videoCall') : t('dashboard.audioCall') }}</p>
      <p class="call-timer">{{ formatCallTime(callTimer) }}</p>
      <p class="call-connected-text">{{ t('dashboard.callConnected') }}</p>
      <div class="call-actions">
        <button class="end-call-button" type="button" @click="emit('end')">{{ t('dashboard.endCall') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop { position: fixed; z-index: 10; inset: 0; display: grid; place-items: center; padding: 18px; background: #071011cc; backdrop-filter: blur(6px); }
.call-modal { width: min(100%, 360px); border: 1px solid #4a756b; border-radius: 16px; padding: 28px 20px; background: #132422; box-shadow: 0 24px 80px #000; text-align: center; }
.call-avatar { width: 72px; height: 72px; margin: 0 auto 16px; display: grid; place-items: center; border: 2px solid #e4b46c; border-radius: 50%; background: #2a3d36; color: #e4b46c; font-size: 28px; }
.call-modal h2 { margin: 0 0 6px; font-size: 22px; color: #eff5f2; }
.call-subtitle { margin: 0 0 12px; color: #e4b46c; font-size: 13px; font-weight: 600; }
.call-timer { margin: 0 0 8px; color: #a5eedb; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.call-connected-text { margin: 0 0 24px; color: #8ba59d; font-size: 12px; }
.call-actions { display: flex; justify-content: center; }
.call-actions--pair { gap: 12px; }
.end-call-button, .decline-call-button { min-height: 44px; padding: 0 28px; border: 0; border-radius: 99px; background: #c63f3f; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }
.accept-call-button { min-height: 44px; padding: 0 28px; border: 0; border-radius: 99px; background: #4d766a; color: #eafff7; font-size: 14px; font-weight: 700; cursor: pointer; }
</style>
