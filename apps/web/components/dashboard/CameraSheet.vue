<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'
import { CONSENT_STORAGE_KEY, shotRect } from '~/composables/media-decisions.mjs'

const emit = defineEmits<{
  shot: [file: File]
  close: []
  error: [kind: 'denied' | 'busy']
}>()

const { t } = useLocale()

const videoEl = ref<HTMLVideoElement | null>(null)
const stream = ref<MediaStream | null>(null)
const facing = ref<'environment' | 'user'>('environment')
const starting = ref(true)

const stop = () => {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
}

/**
 * Камера відкривається на тап по 📷 — жест уже витрачений, тож діалог дозволу
 * нічого не «зʼїдає». `audio: false` принципове: фото не потребує мікрофона, а
 * запит на нього повторив би дозвіл у Telegram WebView.
 */
const open = async (mode: 'environment' | 'user') => {
  starting.value = true
  stop()
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    })
    // Той самий знак, що в `useVoiceRecorder.ts:118`: без нього наступна відмова
    // читалась би як «пристрою немає камери», а не як «користувач натиснув «Ні»».
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted')
    starting.value = false
  } catch (error: any) {
    starting.value = false
    emit('error', error?.name === 'NotReadableError' ? 'busy' : 'denied')
  }
}

const shoot = () => {
  const video = videoEl.value
  const rect = shotRect({ videoWidth: video?.videoWidth || 0, videoHeight: video?.videoHeight || 0 })
  if (!video || !rect) { emit('error', 'busy'); return }
  const canvas = document.createElement('canvas')
  canvas.width = rect.out
  canvas.height = rect.out
  const ctx = canvas.getContext('2d')
  if (!ctx) { emit('error', 'busy'); return }
  ctx.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.out, rect.out)
  canvas.toBlob((blob) => {
    if (!blob) { emit('error', 'busy'); return }
    emit('shot', new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }))
  }, 'image/jpeg', 0.85)
}

const flip = () => {
  facing.value = facing.value === 'environment' ? 'user' : 'environment'
  void open(facing.value)
}

onMounted(() => { void open(facing.value) })
onBeforeUnmount(stop)
</script>

<template>
  <div class="camera-backdrop" @click="emit('close')">
    <div class="camera-sheet" @click.stop>
      <video ref="videoEl" :srcObject.prop="stream" class="camera-live" muted playsinline autoplay></video>
      <div class="camera-actions">
        <button type="button" class="camera-btn" :aria-label="t('dashboard.cameraClose')" @click="emit('close')">✕</button>
        <button type="button" class="camera-btn camera-shutter" :aria-label="t('dashboard.cameraShot')" :disabled="starting" @click="shoot">◉</button>
        <button type="button" class="camera-btn" :aria-label="t('dashboard.cameraFlip')" :disabled="starting" @click="flip">⟲</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.camera-backdrop { position: fixed; z-index: 10; inset: 0; display: grid; place-items: center; padding: 18px; background: #071011cc; backdrop-filter: blur(6px); }
.camera-sheet { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.camera-live { width: min(300px, 72vw); aspect-ratio: 1; border: 2px solid #e4b46c; border-radius: 50%; background: #0d1718; object-fit: cover; }
.camera-actions { display: flex; align-items: center; gap: 14px; }
.camera-btn { display: grid; width: 46px; height: 46px; place-items: center; border: 1px solid #3d524f; border-radius: 50%; background: #192d2b; color: #dbe7e3; font-size: 16px; cursor: pointer; }
.camera-btn:disabled { opacity: .5; }
.camera-shutter { width: 66px; height: 66px; border-color: #e4b46c; background: #d9ad6d; color: #18211e; font-size: 22px; }
</style>
