<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useLocale } from '~/composables/useLocale'
import { TICK_GLYPH, TICK_LABEL_KEY } from '~/composables/chat-status.mjs'
import ChatMessage from './ChatMessage.vue'
import VoiceBubble from './VoiceBubble.vue'
import MediaBubble from './MediaBubble.vue'

type Entry = { message: any; media: any; shown: string | null | undefined }

const props = defineProps<{
  entries: Entry[]
  userId: string | undefined
  createdAt: string
  emptyText: string
  dateLabel: string
  // Helpers coming from useChat
  parseVoice: (body: string) => { audioUrl: string; durationSec: number }
  isVoicePlaying: (id: string) => boolean
  voiceProgressPercent: (id: string) => number
  messageSpeed: (id: string) => number
  isPinned: (id: string) => boolean
  messageTick: (message: any) => string | null
}>()

const emit = defineEmits<{
  playVoice: [id: string, audioUrl: string, durationSec: number]
  pauseVoice: [id: string]
  toggleSpeed: [id: string]
  togglePin: [message: any]
}>()

const { locale, t } = useLocale()
const localeTag: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }
const formatTime = (date: string | Date) =>
  new Intl.DateTimeFormat(localeTag[locale.value], { hour: '2-digit', minute: '2-digit' }).format(new Date(date))
const formatDate = (date: string) =>
  new Intl.DateTimeFormat(localeTag[locale.value], { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))

// Галочку рахуємо тут, а не в шаблоні: на рядок її виклик було б чотири.
const rows = computed(() => props.entries.map((entry) => {
  const tick = props.messageTick(entry.message)
  return { ...entry, tick, tickLabel: tick ? t(TICK_LABEL_KEY[tick]) : '' }
}))

// Список тепер власний скрол-контейнер, тому відкриття кімнати і нові повідомлення
// мають залишатися внизу — інакше користувач бачив би найстаріші булі.
const listEl = ref<HTMLElement | null>(null)
const scrollToBottom = () => {
  const el = listEl.value
  if (el) el.scrollTop = el.scrollHeight
}
const isNearBottom = () => {
  const el = listEl.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120
}
watch(() => props.entries, async () => {
  const stick = isNearBottom()
  await nextTick()
  if (stick) scrollToBottom()
})
onMounted(scrollToBottom)
</script>

<template>
  <div ref="listEl" class="message-list" aria-live="polite">
    <p class="chat-date">{{ dateLabel }} · {{ formatDate(createdAt.slice(0, 10)) }}</p>
    <article
      v-for="entry in rows"
      :key="entry.message.id"
      class="message"
      :class="{ mine: entry.message.senderId === userId, pinned: isPinned(entry.message.id) }"
    >
      <VoiceBubble
        v-if="entry.shown === 'voice'"
        :message="entry.message"
        :is-playing="isVoicePlaying(entry.message.id)"
        :progress-percent="voiceProgressPercent(entry.message.id)"
        :speed="messageSpeed(entry.message.id)"
        :audio-url="parseVoice(entry.message.body).audioUrl"
        :duration-sec="parseVoice(entry.message.body).durationSec || 0"
        @play="emit('playVoice', entry.message.id, parseVoice(entry.message.body).audioUrl, parseVoice(entry.message.body).durationSec || 0)"
        @pause="emit('pauseVoice', entry.message.id)"
        @toggle-speed="emit('toggleSpeed', entry.message.id)"
      />
      <MediaBubble
        v-else-if="entry.media"
        :media="{ url: entry.media.url, kind: entry.media.kind, round: entry.media.round, durationSec: entry.media.durationSec }"
        :is-pinned="isPinned(entry.message.id)"
        @toggle-pin="emit('togglePin', entry.message)"
      />
      <ChatMessage v-else :message="entry.message" :shown="entry.shown" />
      <div class="meta">
        <span class="meta-time">{{ formatTime(entry.message.createdAt) }}</span>
        <span v-if="entry.tick" class="ticks" :class="entry.tick" :aria-label="entry.tickLabel">{{ TICK_GLYPH[entry.tick] }}</span>
      </div>
    </article>
    <p v-if="entries.length === 0" class="chat-start">{{ emptyText }}</p>
  </div>
</template>

<style scoped>
.message-list { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; gap: 9px; overflow-y: auto; overscroll-behavior: contain; padding: 14px; -webkit-overflow-scrolling: touch; }
.chat-date { align-self: center; margin: 4px 0 12px; color: #80918d; font-size: 10px; }
.message { position: relative; max-width: 82%; align-self: flex-start; border: 1px solid #354747; border-radius: 11px 11px 11px 3px; padding: 9px 11px 6px; background: #203332; }
.message.mine { align-self: flex-end; border-color: #4d766a; border-radius: 11px 11px 3px 11px; background: #29473f; }
.message .meta { display: flex; margin-top: 4px; align-items: baseline; justify-content: flex-end; gap: 5px; }
.meta-time { color: #91a59e; font-size: 9px; }
.ticks { color: #7f948d; font-size: 10px; letter-spacing: -1.5px; white-space: nowrap; }
.ticks.read { color: #6ee7c7; }
.ticks.pending { opacity: .6; }
.message.pinned { border-color: #e4b46c; }
.chat-start { align-self: center; max-width: 270px; margin: auto; color: #a2b3ae; text-align: center; font-size: 13px; line-height: 1.5; }
</style>
