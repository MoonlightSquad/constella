<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'

defineProps<{
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
</script>

<template>
  <!-- Round video note -->
  <div v-if="media.round" class="note-bubble">
    <video :src="media.url" class="note-video" preload="metadata" loop playsinline controls></video>
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
.note-bubble { position: relative; width: 116px; height: 116px; overflow: hidden; border: 2px solid #e4b46c; border-radius: 50%; background: #0d1718; }
.note-video { width: 100%; height: 100%; object-fit: cover; }
.note-time { position: absolute; right: 10px; bottom: 8px; padding: 2px 6px; border-radius: 99px; background: #000000a8; color: #fff; font-size: 9px; }
.media-bubble { display: flex; flex-direction: column; gap: 4px; max-width: 100%; }
.media-preview { width: min(100%, 260px); max-height: 260px; border-radius: 8px; background: #0d1718; object-fit: cover; }
.media-label { color: #879b95; font-size: 10px; }
.pin-btn-inline { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; border: 1px solid #4a756b; border-radius: 50%; background: #1b3832; color: #a5eedb; font-size: 11px; cursor: pointer; opacity: .6; }
.pin-btn-inline.active { opacity: 1; border-color: #e4b46c; }
</style>
