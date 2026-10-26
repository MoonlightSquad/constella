<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'
import { useChat } from '~/composables/useChat'
import { useCallRoom } from '~/composables/useCallRoom'
import { useVoiceRecorder } from '~/composables/useVoiceRecorder'
import ChatRoomHeader from './ChatRoomHeader.vue'
import ChatMessageList from './ChatMessageList.vue'
import ChatComposer from './ChatComposer.vue'
import CallOverlay from './CallOverlay.vue'

type Match = {
  id: string
  createdAt: string
  profile: { id: string; displayName: string; age: number; city: string | null } | null
  lastMessage: { body: string; kind: string | null; sentByMe: boolean; createdAt: string } | null
}

const props = defineProps<{
  matches: Match[]
  account: Record<string, any>
  isLoading: boolean
}>()

const emit = defineEmits<{
  toast: [msg: string]
  refresh: []
  report: [profile: any, matchId?: string]
  backToOrbit: []
}>()

const { $trpc } = useNuxtApp() as any
const { locale, t } = useLocale()
const localeTag: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }
const formatTime = (date: string | Date) =>
  new Intl.DateTimeFormat(localeTag[locale.value], { hour: '2-digit', minute: '2-digit' }).format(new Date(date))

const getUserId = () => props.account?.userId as string | undefined

// ---------- Chat (WS, messages, media, audio) ----------
const chat = useChat({
  onToast: (msg) => emit('toast', msg),
  onMatchRefresh: async () => { emit('refresh') },
  onQuestRefresh: async () => { emit('refresh') },
  getUserId,
  onCallIncoming: (payload) => {
    if (callPhase.value !== 'idle') return
    callInfo.value = { matchId: payload.matchId, roomId: payload.roomId, callType: payload.callType, peerName: payload.fromName || t('dashboard.traveler') }
    callPhase.value = 'incoming'
    emit('toast', t('dashboard.callIncoming'))
  },
  onCallAccepted: async (payload) => {
    if (callPhase.value !== 'outgoing' || callInfo.value?.roomId !== payload.roomId) return
    if (ringTimeout) { window.clearTimeout(ringTimeout); ringTimeout = null }
    callPhase.value = 'active'
    startTick()
    if (!(await joinRoom(payload.callType))) await hangUp('failed')
  },
  onCallRejected: (payload) => {
    if (callInfo.value?.roomId !== payload.roomId) return
    forgetCall()
    emit('toast', t('dashboard.callRejected'))
  },
  onCallEnded: async (payload) => {
    if (callInfo.value?.roomId !== payload.roomId) return
    await finishFromRemote()
    emit('toast', payload.reason === 'missed' ? t('chats.missedCall') : t('dashboard.callEnded'))
  },
})

const closeRoom = () => chat.closeChat()

// ---------- Voice / note recorder ----------
const recorder = useVoiceRecorder({
  onToast: (msg) => emit('toast', msg),
  getSelectedMatchId: () => chat.selectedMatch.value?.id ?? null,
  onSend: async (type, payload) => {
    if (type === 'voice') {
      await $trpc.social.sendVoiceMessage.mutate({ matchId: payload.matchId, audioUrl: payload.audioUrl, durationSec: payload.durationSec })
    } else {
      await $trpc.social.sendMessage.mutate({ matchId: payload.matchId, body: payload.body })
    }
    await chat.loadChatMessages()
    emit('refresh')
  },
})

// ---------- Calls ----------
/** Рінг тримає браузер ініціатора: серверного воркера для таймаута на Vercel немає. */
const RING_TIMEOUT_MS = 30_000

type CallInfo = { matchId: string; roomId: string; callType: 'audio' | 'video'; peerName: string }

const callPhase = ref<'idle' | 'outgoing' | 'incoming' | 'active'>('idle')
const callInfo = ref<CallInfo | null>(null)
const callSeconds = ref(0)
const isCallBusy = ref(false)
const callsAvailable = ref(false)
/** Видається по одному на учасника: ініціатору — у `startCall`, піру — у `acceptCall`. */
let callCredentials: { url: string; token: string } | null = null
let callTick: number | null = null
let ringTimeout: number | null = null

const room = useCallRoom({
  onToast: (msg) => emit('toast', msg),
  onPeerLeft: () => { if (callPhase.value === 'active') void hangUp('ended') },
})

const stopTick = () => {
  if (callTick) { window.clearInterval(callTick); callTick = null }
  if (ringTimeout) { window.clearTimeout(ringTimeout); ringTimeout = null }
}

const startTick = () => {
  stopTick()
  callSeconds.value = 0
  callTick = window.setInterval(() => { callSeconds.value += 1 }, 1000)
}

const forgetCall = () => {
  stopTick()
  callCredentials = null
  callInfo.value = null
  callPhase.value = 'idle'
  callSeconds.value = 0
}

const loadCallConfig = async () => {
  try {
    const [config, transport] = await Promise.all([
      $trpc.social.callConfig.query(),
      chat.loadRealtimeConfig(),
    ])
    // Рінг приходить лише з Ably: через опитування ніхто дзвінка не почує, а
    // кнопка, яка нікого не будить, гірша за відсутність кнопки.
    callsAvailable.value = Boolean(config?.available) && transport === 'ably'
  } catch { callsAvailable.value = false }
}

const joinRoom = async (callType: 'audio' | 'video') => {
  if (!callCredentials) return false
  return room.connect({ url: callCredentials.url, token: callCredentials.token, callType })
}

/** Ініціатива користувача: закриваємо кімнату і повідомляємо сервер. */
const hangUp = async (reason: 'ended' | 'missed' | 'failed') => {
  const info = callInfo.value
  forgetCall()
  await room.disconnect()
  if (!info) return
  try {
    await $trpc.social.endCall.mutate({ matchId: info.matchId, roomId: info.roomId, reason })
  } catch (err: any) {
    emit('toast', err?.message || t('dashboard.loadError'))
  }
  await chat.loadChatMessages()
  emit('refresh')
}

/** Подія від піра: лише згортаємо UI, жодного повторного `endCall`. */
const finishFromRemote = async () => {
  forgetCall()
  await room.disconnect()
  await chat.loadChatMessages()
  emit('refresh')
}

const startCallUI = async (callType: 'audio' | 'video') => {
  const match = chat.selectedMatch.value
  if (!match || callPhase.value !== 'idle' || isCallBusy.value) return
  isCallBusy.value = true
  try {
    const s = await $trpc.social.startCall.mutate({ matchId: match.id, callType })
    callCredentials = { url: s.url, token: s.token }
    callInfo.value = { matchId: match.id, roomId: s.roomId, callType, peerName: match.profile?.displayName || t('dashboard.traveler') }
    callPhase.value = 'outgoing'
    ringTimeout = window.setTimeout(() => { void hangUp('missed') }, RING_TIMEOUT_MS)
  } catch (err: any) { emit('toast', err?.message || t('dashboard.loadError')) } finally { isCallBusy.value = false }
}

const acceptIncomingCall = async () => {
  const info = callInfo.value
  if (!info || isCallBusy.value) return
  isCallBusy.value = true
  try {
    const s = await $trpc.social.acceptCall.mutate({ matchId: info.matchId, roomId: info.roomId })
    callCredentials = { url: s.url, token: s.token }
    callPhase.value = 'active'
    startTick()
    if (!(await joinRoom(info.callType))) await hangUp('failed')
  } catch (err: any) {
    emit('toast', err?.message || t('dashboard.loadError'))
    forgetCall()
  } finally { isCallBusy.value = false }
}

const declineIncomingCall = async () => {
  const info = callInfo.value
  forgetCall()
  if (!info) return
  try {
    await $trpc.social.rejectCall.mutate({ matchId: info.matchId, roomId: info.roomId })
    await chat.loadChatMessages()
  } catch (err: any) { emit('toast', err?.message || t('dashboard.loadError')) }
}

// ---------- Safety ----------
const requestConfirmation = (message: string) => new Promise<boolean>((resolve) => {
  const telegram = (window as any).Telegram?.WebApp
  if (telegram?.showConfirm) telegram.showConfirm(message, resolve)
  else resolve(window.confirm(message))
})

const blockProfile = async (profileId: string, matchId?: string) => {
  if (!(await requestConfirmation(t('dashboard.blockConfirm')))) return
  try {
    await $trpc.social.blockProfile.mutate({ profileId })
    emit('toast', t('dashboard.blocked'))
    if (matchId && chat.selectedMatch.value?.id === matchId) closeRoom()
    emit('refresh')
  } catch (err: any) { emit('toast', err?.message || t('dashboard.loadError')) }
}

const onPickFile = (file: File) => { void chat.sendMediaMessage(file) }

onMounted(() => { void loadCallConfig() })

onUnmounted(() => {
  chat.closeRealtime()
  chat.stopAllVoices()
  // Закрита вкладка не повинна залишати піра у стані «дзвінок йде».
  if (callPhase.value !== 'idle') void hangUp(callPhase.value === 'active' ? 'ended' : 'missed')
})
</script>

<template>
  <section class="view chats-view">
    <div v-if="chat.selectedMatch.value" class="chat-panel">
      <ChatRoomHeader
        :match="chat.selectedMatch.value"
        :ws-connected="chat.wsConnected.value"
        :contact-info="chat.contactInfo.value"
        :is-sharing-contact="chat.isSharingContact.value"
        :notifications-enabled="chat.notificationsEnabled.value"
        :calls-available="callsAvailable"
        @back="closeRoom"
        @start-call="startCallUI"
        @share-contact="chat.shareContact()"
        @block="(pid: string, mid: string) => blockProfile(pid, mid)"
        @report="(p: any, mid: string) => emit('report', p, mid)"
        @refresh="chat.loadChatMessages()"
        @toggle-notifications="chat.toggleNotifications()"
        @reconnect="(mid: string) => chat.connectRealtime(mid)"
      />
      <ChatMessageList
        :entries="chat.renderedMessages.value"
        :user-id="getUserId()"
        :created-at="chat.selectedMatch.value.createdAt"
        :date-label="t('dashboard.chatDate')"
        :empty-text="t('dashboard.chatStart')"
        :parse-voice="chat.parseVoice"
        :is-voice-playing="chat.isVoicePlaying"
        :voice-progress-percent="chat.voiceProgressPercent"
        :message-speed="chat.messageSpeed"
        :is-pinned="chat.isPinned"
        @play-voice="(id, url, dur) => chat.playVoice(id, url, dur)"
        @pause-voice="(id) => chat.pauseVoice(id)"
        @toggle-speed="(id) => chat.togglePlaybackSpeed(id)"
        @toggle-pin="(m) => chat.togglePinMedia(m)"
      />
      <ChatComposer
        :chat-mode="recorder.chatMode.value"
        :chat-draft="chat.chatDraft.value"
        :is-recording="recorder.isRecording.value"
        :is-recording-video="recorder.isRecordingVideo.value"
        :is-sending="chat.isSending.value"
        :hold-label="recorder.holdLabel.value"
        :note-stream="recorder.noteStream.value"
        @update:chat-draft="(v: string) => chat.chatDraft.value = v"
        @send="chat.sendMessage()"
        @composer-input="chat.onComposerInput()"
        @pick-file="onPickFile"
        @record-down="recorder.onRecordPointerDown"
        @record-move="recorder.onHoldMove"
        @record-up="recorder.onRecordPointerUp"
        @record-cancel="recorder.onRecordPointerCancel"
        @set-mode="(m: 'voice' | 'note') => recorder.chatMode.value = m"
      />
      <p class="chat-footnote">{{ chat.wsConnected.value ? t('dashboard.reconnected') : t('dashboard.connecting') }}</p>
    </div>

    <template v-else>
      <p class="eyebrow">{{ t('dashboard.mutualEyebrow') }}</p>
      <div class="view-heading"><h1>{{ t('dashboard.chats') }}</h1><span class="counter">{{ matches.length }}</span></div>
      <div v-if="isLoading" class="empty-state">{{ t('dashboard.loadingChats') }}</div>
      <div v-else-if="matches.length" class="match-list">
        <button v-for="match in matches" :key="match.id" class="match-row" type="button" @click="chat.openChat(match)">
          <div class="mini-avatar">{{ match.profile?.city?.slice(0, 1)?.toUpperCase() || '✦' }}</div>
          <div class="match-copy">
            <div class="match-title"><strong>{{ match.profile?.displayName || t('dashboard.newMatch') }}</strong><time>{{ match.lastMessage ? formatTime(match.lastMessage.createdAt) : formatTime(match.createdAt) }}</time></div>
            <p>{{ match.lastMessage ? `${match.lastMessage.sentByMe ? t('dashboard.you') : ''}${chat.previewBody(match.lastMessage.body, match.lastMessage.kind)}` : t('dashboard.matchStart') }}</p>
          </div>
          <span class="row-arrow">›</span>
        </button>
      </div>
      <div v-else class="empty-state">
        <span class="empty-star">♡</span>
        <h2>{{ t('dashboard.noMatches') }}</h2>
        <p>{{ t('dashboard.noMatchesHint') }}</p>
        <button type="button" class="text-button" @click="emit('backToOrbit')">{{ t('dashboard.backOrbit') }}</button>
      </div>
    </template>

    <CallOverlay
      :phase="callPhase"
      :room-phase="room.phase.value"
      :call-type="callInfo?.callType ?? 'audio'"
      :peer-name="callInfo?.peerName ?? ''"
      :seconds="callSeconds"
      :mic-enabled="room.micEnabled.value"
      :cam-enabled="room.camEnabled.value"
      :peer-present="room.peerPresent.value"
      :local-stream="room.localStream.value"
      :remote-stream="room.remoteStream.value"
      @accept="acceptIncomingCall"
      @decline="declineIncomingCall"
      @end="hangUp(callPhase === 'outgoing' ? 'missed' : 'ended')"
      @toggle-mic="room.toggleMic()"
      @toggle-cam="room.toggleCam()"
    />
  </section>
</template>

<style scoped>
.view { width: min(100%, 720px); margin: 0 auto; }
.eyebrow { margin: 0 0 10px; color: #85c9b9; font-size: 10px; font-weight: 750; letter-spacing: .14em; }
.view-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
h1 { margin: 0; font-size: clamp(25px, 6vw, 34px); line-height: 1.12; }
.counter { display: inline-flex; align-items: baseline; gap: 3px; padding: 7px 10px; border: 1px solid #334545; border-radius: 8px; color: #e7bd7e; font-size: 18px; font-weight: 700; }
.chat-panel { display: flex; min-height: min(72svh, 720px); flex-direction: column; border: 1px solid #2b3c3d; border-radius: 10px; background: #121f20; }
.match-list { border-top: 1px solid #2a393a; }
.match-row { display: flex; width: 100%; align-items: center; gap: 12px; border: 0; border-bottom: 1px solid #2a393a; padding: 14px 3px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.mini-avatar { display: grid; width: 46px; height: 46px; flex: 0 0 auto; place-items: center; border: 1px solid #587169; border-radius: 50%; background: #24423d; color: #dbf0e6; font-size: 16px; font-weight: 700; }
.match-copy { min-width: 0; flex: 1; }
.match-title { display: flex; justify-content: space-between; gap: 12px; }
.match-title strong { font-size: 14px; }
.match-title time, .match-copy p { color: #879894; font-size: 11px; }
.match-copy p { overflow: hidden; margin: 4px 0 0; text-overflow: ellipsis; white-space: nowrap; }
.row-arrow { color: #80918c; font-size: 23px; }
.empty-state { display: grid; min-height: 300px; align-content: center; justify-items: center; padding: 28px 22px; color: #a8b8b4; text-align: center; }
.empty-state h2 { margin: 13px 0 4px; color: #eff3ee; font-size: 20px; }
.empty-state p { max-width: 400px; margin: 7px 0 15px; line-height: 1.55; }
.empty-star { color: #e4b46c; font-size: 30px; }
.text-button { min-height: 44px; border: 0; background: none; color: #85c9b9; font-size: 13px; font-weight: 700; cursor: pointer; }
.chat-footnote { margin: 0; padding: 0 12px 9px; color: #7d8c89; font-size: 9px; }
</style>
