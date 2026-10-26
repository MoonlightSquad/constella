<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  phase: 'idle' | 'outgoing' | 'incoming' | 'active'
  /** Стан LiveKit-кімнати: відрізняє «ще зʼєднуємося» від «мережа відновлюється». */
  roomPhase: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
  callType: 'audio' | 'video'
  peerName: string
  seconds: number
  micEnabled: boolean
  camEnabled: boolean
  peerPresent: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
}>()

const emit = defineEmits<{
  accept: []
  decline: []
  end: []
  'toggle-mic': []
  'toggle-cam': []
}>()

const { t } = useLocale()

const formatCallTime = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Поки опонент не в кімнаті, «зʼєднано» брехало б — для аудіо це єдиний індикатор. */
const statusText = computed(() => {
  if (props.roomPhase === 'reconnecting') return t('dashboard.callDisconnected')
  if (props.roomPhase === 'failed') return t('dashboard.callFailed')
  if (!props.peerPresent || props.roomPhase !== 'connected') return t('dashboard.callWaitingPeer')
  return t('dashboard.callConnected')
})
</script>

<template>
  <div v-if="phase === 'incoming'" class="modal-backdrop">
    <div class="call-modal">
      <div class="call-avatar">✦</div>
      <h2>{{ peerName }}</h2>
      <p class="call-subtitle">{{ t('dashboard.callIncoming') }} · {{ callType === 'video' ? t('dashboard.videoCall') : t('dashboard.audioCall') }}</p>
      <div class="call-actions call-actions--pair">
        <button class="decline-call-button" type="button" @click="emit('decline')">{{ t('dashboard.callDecline') }}</button>
        <button class="accept-call-button" type="button" @click="emit('accept')">{{ t('dashboard.callAccept') }}</button>
      </div>
    </div>
  </div>

  <div v-else-if="phase === 'outgoing'" class="modal-backdrop">
    <div class="call-modal">
      <div class="call-avatar">✦</div>
      <h2>{{ peerName }}</h2>
      <p class="call-subtitle">{{ t('dashboard.callOutgoing') }}</p>
      <div class="call-actions">
        <button class="decline-call-button" type="button" @click="emit('end')">{{ t('dashboard.endCall') }}</button>
      </div>
    </div>
  </div>

  <div v-else-if="phase === 'active'" class="modal-backdrop">
    <div class="call-modal" :class="{ 'call-modal--video': callType === 'video' && camEnabled }">
      <video
        v-if="callType === 'video' && remoteStream"
        class="call-video"
        :srcObject.prop="remoteStream"
        autoplay
        playsinline
      ></video>
      <video
        v-if="callType === 'video' && camEnabled && localStream"
        class="call-video call-video--self"
        :srcObject.prop="localStream"
        muted
        autoplay
        playsinline
      ></video>
      <div v-if="callType !== 'video' || !remoteStream" class="call-avatar">✦</div>

      <h2>{{ peerName }}</h2>
      <p class="call-subtitle">{{ callType === 'video' ? t('dashboard.videoCall') : t('dashboard.audioCall') }}</p>
      <p class="call-timer">{{ formatCallTime(seconds) }}</p>
      <p class="call-connected-text">{{ statusText }}</p>
      <div class="call-actions call-actions--tools">
        <button class="call-toggle" type="button" :title="micEnabled ? t('dashboard.micOn') : t('dashboard.micOff')" @click="emit('toggle-mic')">
          {{ micEnabled ? '🎙' : '🔇' }}
        </button>
        <button
          v-if="callType === 'video'"
          class="call-toggle"
          type="button"
          :title="camEnabled ? t('dashboard.camOn') : t('dashboard.camOff')"
          @click="emit('toggle-cam')"
        >
          {{ camEnabled ? '📹' : '🚫' }}
        </button>
        <button class="end-call-button" type="button" @click="emit('end')">{{ t('dashboard.endCall') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop { position: fixed; z-index: 10; inset: 0; display: grid; place-items: center; padding: 18px; background: #071011cc; backdrop-filter: blur(6px); }
.call-modal { position: relative; width: min(100%, 360px); border: 1px solid #4a756b; border-radius: 16px; padding: 28px 20px; background: #132422; box-shadow: 0 24px 80px #000; text-align: center; overflow: hidden; }
.call-modal--video { padding-top: 0; }
.call-video { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #0b1614; }
.call-video--self { position: absolute; top: 10px; right: 10px; width: 88px; aspect-ratio: 3 / 4; border: 1px solid #4a756b; border-radius: 10px; }
.call-avatar { width: 72px; height: 72px; margin: 28px auto 16px; display: grid; place-items: center; border: 2px solid #e4b46c; border-radius: 50%; background: #2a3d36; color: #e4b46c; font-size: 28px; }
.call-modal h2 { margin: 0 0 6px; font-size: 22px; color: #eff5f2; }
.call-subtitle { margin: 0 0 12px; color: #e4b46c; font-size: 13px; font-weight: 600; }
.call-timer { margin: 0 0 8px; color: #a5eedb; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.call-connected-text { margin: 0 0 24px; color: #8ba59d; font-size: 12px; }
.call-actions { display: flex; justify-content: center; }
.call-actions--pair { gap: 12px; }
.call-actions--tools { gap: 10px; }
.call-toggle { min-width: 48px; height: 44px; border: 1px solid #4a756b; border-radius: 99px; background: #2a3d36; color: #eafff7; font-size: 17px; cursor: pointer; }
.end-call-button, .decline-call-button { min-height: 44px; padding: 0 28px; border: 0; border-radius: 99px; background: #c63f3f; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }
.accept-call-button { min-height: 44px; padding: 0 28px; border: 0; border-radius: 99px; background: #4d766a; color: #eafff7; font-size: 14px; font-weight: 700; cursor: pointer; }
</style>
