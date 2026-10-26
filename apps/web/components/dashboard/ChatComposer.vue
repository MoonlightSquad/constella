<script setup lang="ts">
import { ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  chatMode: 'voice' | 'note'
  chatDraft: string
  isRecording: boolean
  isRecordingVideo: boolean
  isSending: boolean
  holdLabel: string
  noteStream: MediaStream | null
}>()

const emit = defineEmits<{
  'update:chatDraft': [value: string]
  send: []
  composerInput: []
  pickFile: [file: File]
  recordDown: [event: PointerEvent]
  recordMove: [event: PointerEvent]
  recordUp: []
  recordCancel: []
  setMode: [mode: 'voice' | 'note']
}>()

const { t } = useLocale()
const fileInput = ref<HTMLInputElement | null>(null)
const attachMenuOpen = ref(false)

const toggleAttach = () => { attachMenuOpen.value = !attachMenuOpen.value }
const openFilePicker = () => { attachMenuOpen.value = false; fileInput.value?.click() }
const onFileSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  emit('pickFile', input.files[0])
  input.value = ''
}
</script>

<template>
  <div v-if="noteStream" class="note-stage">
    <video :srcObject.prop="noteStream" class="note-live" muted playsinline autoplay></video>
  </div>
  <form class="composer" @submit.prevent="emit('send')">
    <input type="file" ref="fileInput" accept="image/*,video/*" class="hidden-file-input" @change="onFileSelected" />
    <div class="attach-wrap">
      <button type="button" class="composer-icon" :aria-label="t('dashboard.attachMedia')" :aria-expanded="attachMenuOpen" @click="toggleAttach">📎</button>
      <div v-if="attachMenuOpen" class="attach-menu" role="menu">
        <button type="button" class="attach-item" role="menuitem" @click="openFilePicker">🖼 {{ t('dashboard.photoVideo') }}</button>
        <button type="button" class="attach-item" role="menuitem" @click="attachMenuOpen = false; emit('setMode', 'note')">⭕ {{ t('dashboard.videoNote') }}</button>
      </div>
    </div>
    <div class="composer-input-wrap">
      <input :value="chatDraft" maxlength="1000" :placeholder="t('dashboard.messagePlaceholder')" autocomplete="off" @input="emit('update:chatDraft', ($event.target as HTMLInputElement).value); emit('composerInput')">
      <span v-if="isRecording || isRecordingVideo" class="recording-overlay">
        <span class="recording-dot">●</span>
        <span class="hold-text">{{ holdLabel }}</span>
      </span>
    </div>
    <button
      type="button"
      class="composer-record-btn"
      :class="{ recording: isRecording || isRecordingVideo }"
      :aria-label="t(chatMode === 'note' ? 'dashboard.holdToNote' : 'dashboard.holdToRecord')"
      @pointerdown.prevent="emit('recordDown', $event)"
      @pointermove="emit('recordMove', $event)"
      @pointerup="emit('recordUp')"
      @pointercancel="emit('recordCancel')"
      @lostpointercapture="emit('recordCancel')"
      @contextmenu.prevent
    >
      {{ chatMode === 'voice' ? '🎙' : '⭕' }}
    </button>
    <button v-if="chatDraft.trim()" type="submit" class="composer-send" :disabled="isSending" :aria-label="t('dashboard.send')">
      {{ isSending ? '…' : '➤' }}
    </button>
  </form>
</template>

<style scoped>
.note-stage { display: grid; place-items: center; padding: 10px 14px 0; }
.note-live { width: min(168px, 32vh); height: min(168px, 32vh); border: 2px solid #e4b46c; border-radius: 50%; background: #0d1718; object-fit: cover; }
.composer { display: flex; align-items: flex-end; gap: 8px; border-top: 1px solid #2b3c3d; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); }
.attach-wrap { position: relative; flex: 0 0 auto; }
.attach-menu { position: absolute; bottom: 44px; left: 0; display: flex; flex-direction: column; gap: 2px; min-width: 168px; border: 1px solid #3d524f; border-radius: 10px; padding: 5px; background: #16282a; box-shadow: 0 14px 40px #0009; z-index: 3; }
.attach-item { display: flex; min-height: 44px; align-items: center; gap: 8px; border: 0; border-radius: 7px; padding: 0 11px; background: transparent; color: #dbe7e3; text-align: left; font-size: 12px; cursor: pointer; }
.attach-item:hover { background: #24413a; }
.hidden-file-input { display: none; }
.composer-icon { display: grid; flex: 0 0 auto; width: 44px; height: 44px; place-items: center; border: 1px solid #3d524f; border-radius: 50%; background: #192d2b; color: #e4b46c; font-size: 15px; cursor: pointer; }
.composer-record-btn { display: grid; flex: 0 0 auto; width: 44px; height: 44px; place-items: center; border: 1px solid #3d524f; border-radius: 50%; background: #192d2b; color: #e4b46c; font-size: 15px; cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none; }
.composer-record-btn.recording { border-color: #c63f3f; background: #2f1818; color: #ff5555; }
.composer-send { display: grid; flex: 0 0 auto; width: 44px; height: 44px; place-items: center; border: 0; border-radius: 50%; background: #d9ad6d; color: #18211e; font-size: 15px; cursor: pointer; }
.composer-send:disabled { opacity: .55; }
.composer-input-wrap { position: relative; flex: 1; min-width: 0; }
.composer-input-wrap input { width: 100%; border: 1px solid #344748; border-radius: 8px; padding: 11px; background: #0d1718; color: #fff; outline: none; }
.recording-overlay { position: absolute; inset: 0; display: flex; align-items: center; gap: 8px; padding: 0 11px; border-radius: 8px; background: #1a1214e0; color: #ffd1cb; font-size: 12px; font-weight: 600; pointer-events: none; }
.recording-dot { color: #ff5555; animation: pulse-rec 1s infinite; }
.hold-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@keyframes pulse-rec { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
