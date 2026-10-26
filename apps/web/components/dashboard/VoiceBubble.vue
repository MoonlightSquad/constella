<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  message: any
  isPlaying: boolean
  progressPercent: number
  speed: number
  audioUrl: string
  durationSec: number
}>()

const emit = defineEmits<{
  play: []
  pause: []
  toggleSpeed: []
}>()

const { t } = useLocale()

const WAVE_BARS = 28
const waveformHeights = (msgId: string): number[] => {
  let h = 0
  for (let i = 0; i < msgId.length; i++) h = ((h << 5) - h + msgId.charCodeAt(i)) | 0
  return Array.from({ length: WAVE_BARS }, (_, i) => {
    const seed = ((h * (i + 1) * 1103515245 + 12345) >>> 16) & 0x7FFF
    return 5 + (seed % 20)
  })
}

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="voice-bubble">
    <button type="button" class="voice-play-btn" :class="{ playing: isPlaying }" :aria-label="isPlaying ? t('dashboard.pause') : t('dashboard.play')" @click="isPlaying ? emit('pause') : emit('play')">
      {{ isPlaying ? '⏸' : '▶' }}
    </button>
    <div class="voice-progress-wrap">
      <div class="voice-wave">
        <span v-for="(height, i) in waveformHeights(message.id)" :key="i" class="wave-bar" :class="{ played: ((i + 1) / WAVE_BARS) * 100 <= progressPercent }" :style="{ height: height + 'px' }"></span>
      </div>
      <span class="voice-time">{{ formatDuration(durationSec) }}</span>
    </div>
    <button type="button" class="speed-btn" :aria-label="t('dashboard.playbackSpeed')" @click="emit('toggleSpeed')">{{ speed }}×</button>
  </div>
</template>

<style scoped>
.voice-bubble { display: flex; align-items: center; gap: 8px; min-width: 200px; max-width: 100%; }
.voice-play-btn { display: grid; flex: 0 0 auto; width: 44px; height: 44px; place-items: center; border: 1px solid #4d766a; border-radius: 50%; background: #24413a; color: #a5eedb; font-size: 13px; cursor: pointer; }
.voice-play-btn.playing { border-color: #e4b46c; color: #e4b46c; }
.voice-progress-wrap { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; }
.voice-wave { display: flex; align-items: center; gap: 1.5px; flex: 1; height: 30px; }
.wave-bar { width: 4px; min-height: 3px; border-radius: 2px; background: #344748; transition: background .15s; }
.wave-bar.played { background: #e4b46c; }
.voice-time { color: #879b95; font-size: 10px; white-space: nowrap; }
.speed-btn { flex: 0 0 auto; min-height: 34px; border: 1px solid #364949; border-radius: 99px; padding: 0 10px; background: #182828; color: #a5eedb; font-size: 10px; font-weight: 700; cursor: pointer; }
</style>
