<script lang="ts">
/**
 * Module scope is shared by every bubble instance: кружок, який грає, має поступитись
 * тому, що стартував другим, інакше чути два звуки одночасно.
 */
let activeNote: (() => void) | null = null
</script>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  media: { url: string; kind: 'image' | 'video'; round: boolean; durationSec: number }
  isPinned: boolean
}>()

defineEmits<{ togglePin: [] }>()

const { t } = useLocale()

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---------- Round video note: own player ----------
const HOLD_FAST_MS = 350
const RING_RADIUS = 53
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

const noteEl = ref<HTMLVideoElement | null>(null)
const playing = ref(false)
const muted = ref(false)
const percent = ref(0)
let holdTimer: number | null = null
let fast = false

/**
 * `MediaRecorder` webm приходить із `duration === Infinity`, тож на мету беремо
 * заявлену в тілі повідомлення тривалість, а як тільки рушій сам порахував справжню — її.
 */
const noteTotal = () => {
  const el = noteEl.value
  const real = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0
  return real || props.media.durationSec || 0
}

const stopNote = () => { noteEl.value?.pause() }

const toggle = () => {
  const el = noteEl.value
  if (!el) return
  if (el.paused) {
    if (activeNote && activeNote !== stopNote) activeNote()
    activeNote = stopNote
    void el.play().catch(() => { playing.value = false })
  } else {
    el.pause()
  }
}

const setFast = (on: boolean) => {
  fast = on
  if (noteEl.value) noteEl.value.playbackRate = on ? 2 : 1
}

const onTimeUpdate = () => {
  const el = noteEl.value
  const total = noteTotal()
  percent.value = el && total ? Math.min(100, (el.currentTime / total) * 100) : 0
}

const onHoldStart = () => {
  holdTimer = window.setTimeout(() => {
    if (noteEl.value?.paused) toggle()
    setFast(true)
  }, HOLD_FAST_MS)
}

const onHoldEnd = () => {
  if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null }
  if (fast) {
    // Затискання зʼїло тап: швидкість повертаємо, але паузу не робимо.
    setFast(false)
    return
  }
  toggle()
}

const onHoldCancel = () => {
  if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null }
  setFast(false)
}

onBeforeUnmount(() => {
  onHoldCancel()
  stopNote()
  if (activeNote === stopNote) activeNote = null
})
</script>

<template>
  <!-- Round video note -->
  <div v-if="media.round" class="note-bubble">
    <video
      ref="noteEl"
      :src="media.url"
      class="note-video"
      preload="metadata"
      loop
      playsinline
      :muted="muted"
      @play="playing = true"
      @pause="playing = false"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="percent = 0"
    ></video>
    <svg class="note-ring" viewBox="0 0 116 116" aria-hidden="true">
      <circle class="note-ring-track" cx="58" cy="58" :r="RING_RADIUS" />
      <circle
        class="note-ring-fill"
        cx="58"
        cy="58"
        :r="RING_RADIUS"
        :stroke-dasharray="RING_LENGTH"
        :stroke-dashoffset="RING_LENGTH * (1 - percent / 100)"
      />
    </svg>
    <button
      type="button"
      class="note-toggle"
      :class="{ playing }"
      :aria-label="playing ? t('dashboard.notePause') : t('dashboard.notePlay')"
      @pointerdown.prevent="onHoldStart"
      @pointerup.prevent="onHoldEnd"
      @pointercancel="onHoldCancel"
      @pointerleave="onHoldCancel"
      @contextmenu.prevent
    >
      <span v-if="!playing" class="note-glyph">▶</span>
    </button>
    <button
      v-if="playing"
      type="button"
      class="note-mute"
      :aria-label="muted ? t('dashboard.unmute') : t('dashboard.mute')"
      @click.stop="muted = !muted"
    >{{ muted ? '🔇' : '🔊' }}</button>
    <span v-if="media.durationSec" class="note-time">{{ formatDuration(media.durationSec) }}</span>
  </div>
  <!-- Video -->
  <div v-else-if="media.kind === 'video'" class="media-bubble">
    <video :src="media.url" class="media-preview" preload="metadata" playsinline controls></video>
    <span class="media-label">{{ t('dashboard.videoMessage') }}</span>
  </div>
  <!-- Image -->
  <div v-else class="media-bubble">
    <img :src="media.url" class="media-preview" :alt="t('dashboard.photoVideo')" />
    <span class="media-label">{{ t('dashboard.photoVideo') }}</span>
  </div>
  <button type="button" class="pin-btn-inline" :class="{ active: isPinned }" :aria-label="isPinned ? t('dashboard.unpin') : t('dashboard.pinnedMedia')" @click.stop="$emit('togglePin')">📌</button>
</template>

<style scoped>
.note-bubble { position: relative; width: 116px; height: 116px; overflow: hidden; border-radius: 50%; background: #0d1718; }
.note-video { width: 100%; height: 100%; object-fit: cover; }
.note-ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); pointer-events: none; }
.note-ring-track { fill: none; stroke: #e4b46c59; stroke-width: 3; }
.note-ring-fill { fill: none; stroke: #e4b46c; stroke-width: 3; stroke-linecap: round; transition: stroke-dashoffset .2s linear; }
.note-toggle { position: absolute; inset: 0; display: grid; place-items: center; border: 0; background: transparent; color: #fff; cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none; }
.note-toggle:not(.playing) { background: #06100f5c; }
.note-glyph { font-size: 26px; line-height: 1; text-shadow: 0 1px 6px #000c; }
.note-mute { position: absolute; top: 20px; right: 20px; width: 24px; height: 24px; border: 0; border-radius: 50%; background: #06100fb3; color: #fff; font-size: 10px; cursor: pointer; }
.note-time { position: absolute; right: 10px; bottom: 8px; padding: 2px 6px; border-radius: 99px; background: #000000a8; color: #fff; font-size: 9px; }
.media-bubble { display: flex; flex-direction: column; gap: 4px; max-width: 100%; }
.media-preview { width: min(100%, 260px); max-height: 260px; border-radius: 8px; background: #0d1718; object-fit: cover; }
.media-label { color: #879b95; font-size: 10px; }
.pin-btn-inline { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; border: 1px solid #4a756b; border-radius: 50%; background: #1b3832; color: #a5eedb; font-size: 11px; cursor: pointer; opacity: .6; }
.pin-btn-inline.active { opacity: 1; border-color: #e4b46c; }
</style>
