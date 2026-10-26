import { computed, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'
import { mediaKindOf } from './media-decisions.mjs'

type Match = {
  id: string
  createdAt: string
  profile: { id: string; displayName: string; city: string | null } | null
  lastMessage: { body: string; kind: string | null; sentByMe: boolean; createdAt: string } | null
}

export interface CallSignalPayload {
  matchId: string
  roomId: string
  callType: 'audio' | 'video'
  fromId: string
  fromName?: string
}

export interface ChatOptions {
  onToast?: (msg: string) => void
  onMatchRefresh?: () => Promise<void>
  onQuestRefresh?: () => Promise<void>
  getUserId?: () => string | undefined
  onCallIncoming?: (payload: CallSignalPayload) => void
  onCallAccepted?: (payload: CallSignalPayload) => void
  onCallRejected?: (payload: { matchId: string; roomId: string }) => void
  onCallEnded?: (payload: { matchId: string; roomId: string; reason?: string; durationSec?: number }) => void
  defaultPeerName?: string
}

export function useChat(options: ChatOptions = {}) {
  const { $trpc } = useNuxtApp() as any
  const { locale, t } = useLocale()
  const getUserId = () => options.getUserId?.()

  const toast = (msg: string) => options.onToast?.(msg)
  const showError = (error: any) => options.onToast?.(error?.message || t('dashboard.loadError'))

  // --- State ---
  const selectedMatch = ref<Match | null>(null)
  const chatMessages = ref<any[]>([])
  const chatDraft = ref('')
  const isLoading = ref(false)
  const isSending = ref(false)
  const peerTyping = ref(false)
  const contactInfo = ref<{ offeredByMe: boolean; mutual: boolean; usernames: string[] } | null>(null)
  const isSharingContact = ref(false)
  const pinnedMedia = ref<any[]>([])
  const notificationPermission = ref<'default' | 'granted' | 'denied'>('default')
  const notificationsEnabled = ref(false)
  const voiceProgress = ref<{ id: string; percent: number }>({ id: '', percent: 0 })

  // --- Realtime ---
  // Браузери не можуть користуватися нашим сокетом: Vercel пинить кожне
  // з'єднання до свого instance, тому події чату й рінг дзвінка приходять з
  // Ably-каналу `match:<id>`. Без Ably лишається опитування — воно не будить
  // піра, тож дзвінки в цьому режимі сховані. Мобілка й далі тримає /api/chat/ws.
  const realtimeTransport = ref<'ably' | 'poll' | null>(null)
  const wsConnected = ref(false)
  let ablyClient: any = null
  let ablyDetach: (() => void) | null = null
  let pollTimer: number | null = null

  const POLL_INTERVAL_MS = 5000

  const loadRealtimeConfig = async (): Promise<'ably' | 'poll'> => {
    if (realtimeTransport.value) return realtimeTransport.value
    try {
      const config = await $trpc.social.realtimeConfig.query()
      realtimeTransport.value = config?.transport === 'ably' ? 'ably' : 'poll'
    } catch {
      realtimeTransport.value = 'poll'
    }
    return realtimeTransport.value
  }

  const closeRealtime = () => {
    if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null }
    if (ablyDetach) { ablyDetach(); ablyDetach = null }
    if (ablyClient) { try { ablyClient.close() } catch {} ; ablyClient = null }
    wsConnected.value = false
  }

  /** Прочитані «вхідні» повідомки — лише коли вкладку видно, як і з сокетом. */
  const markIncomingRead = (message: any) => {
    const matchId = selectedMatch.value?.id
    if (!message || !matchId || message.matchId !== matchId) return
    if (message.senderId === getUserId()) return
    if (document.visibilityState !== 'visible') return
    void $trpc.social.markRead.mutate({ matchId, messageIds: [message.id] }).catch(() => {})
  }

  const applyReadReceipt = (data: any) => {
    const ids: number[] = Array.isArray(data.messageIds) ? data.messageIds : [data.messageId]
    for (const id of ids) {
      const m = chatMessages.value.find((x: any) => x.id === id)
      if (m) m.readAt = data.readAt
    }
  }

  const handleRealtimeEvent = (data: any) => {
    if (!data || typeof data !== 'object') return
    // Спільний канал не може пропустити автора, як `exceptUserId` у сокетів,
    // тому подію, яку ми самі й спричинили, відкидаємо тут.
    if (data.actorId && data.actorId === getUserId()) return
    if (data.type === 'chat.message') {
      appendMessage(data.message)
      markIncomingRead(data.message)
      if (notificationsEnabled.value && data.message && data.message.senderId !== getUserId() && document.visibilityState !== 'visible') {
        void showNewMessageNotification(data.message, selectedMatch.value)
      }
    } else if (data.type === 'chat.typing') {
      peerTyping.value = true
      window.setTimeout(() => { peerTyping.value = false }, 3000)
    } else if (data.type === 'call.incoming') {
      options.onCallIncoming?.({ matchId: data.matchId, roomId: data.roomId, callType: data.callType, fromId: data.fromId, fromName: data.fromName })
    } else if (data.type === 'call.accepted') {
      options.onCallAccepted?.({ matchId: data.matchId, roomId: data.roomId, callType: data.callType, fromId: data.fromId, fromName: data.fromName })
    } else if (data.type === 'call.rejected') {
      options.onCallRejected?.({ matchId: data.matchId, roomId: data.roomId })
    } else if (data.type === 'call.ended') {
      options.onCallEnded?.({ matchId: data.matchId, roomId: data.roomId, reason: data.reason, durationSec: data.durationSec })
    } else if (data.type === 'presence.read') {
      applyReadReceipt(data)
    }
  }

  /**
   * `ably` тягнеться лише динамічно: ChatPanel рендериться під SSR, а SDK
   * чіпляється до `window` іще на імпорті — той самий прийом, що в `useCallRoom`.
   */
  const connectAbly = async (matchId: string) => {
    const Ably = await import('ably')
    const onMessage = (message: any) => handleRealtimeEvent(message?.data)
    const client = new Ably.Realtime({
      authCallback: (_params: unknown, callback: (error: any, token: any) => void) => {
        $trpc.social.chatToken
          .mutate({ matchId })
          .then((token: any) => callback(null, token))
          .catch((error: any) => callback(error?.message || 'chatToken failed', null))
      },
    })
    client.connection.on('statusChange', (status: any) => {
      wsConnected.value = status?.current === 'connected'
    })
    const channel = client.channels.get(`match:${matchId}`)
    try {
      await channel.attach()
      channel.subscribe(onMessage)
    } catch (error) {
      try { client.close() } catch {}
      throw error
    }
    ablyClient = client
    ablyDetach = () => { try { channel.unsubscribe(onMessage) } catch {} }
  }

  /** Хвіст гілки через наявний курсор `afterId`: витягуємо нові рядки, а не всю історію. */
  const pollChatTail = async (matchId: string) => {
    if (document.visibilityState !== 'visible') return
    const lastId = chatMessages.value.reduce((max: number, m: any) => Math.max(max, Number(m.id) || 0), 0)
    try {
      const res = await $trpc.social.chatMessages.query({ matchId, afterId: lastId })
      const tail = Array.isArray(res) ? res : res?.messages || []
      for (const message of tail) { appendMessage(message); markIncomingRead(message) }
    } catch {}
  }

  const connectRealtime = async (matchId: string) => {
    closeRealtime()
    const transport = await loadRealtimeConfig()
    if (transport === 'ably') {
      try {
        await connectAbly(matchId)
        return
      } catch { /* Ably не піднявся — переходимо на опитування */ }
    }
    // «Під'єднано» тут означає «гілка жива»: дані приходять, просто не миттєво.
    wsConnected.value = true
    pollTimer = window.setInterval(() => { void pollChatTail(matchId) }, POLL_INTERVAL_MS)
    void pollChatTail(matchId)
  }

  // --- Typing ---
  let lastTypingSentAt = 0
  const onComposerInput = () => {
    const matchId = selectedMatch.value?.id
    if (!matchId || !wsConnected.value || realtimeTransport.value !== 'ably') return
    const now = Date.now()
    if (now - lastTypingSentAt < 1500) return
    lastTypingSentAt = now
    void $trpc.social.notifyTyping.mutate({ matchId }).catch(() => {})
  }

  // --- Messages ---
  const loadChatMessages = async () => {
    if (!selectedMatch.value) return
    try {
      const res = await $trpc.social.chatMessages.query({ matchId: selectedMatch.value.id })
      if (Array.isArray(res)) {
        chatMessages.value = res
        contactInfo.value = null
      } else if (res && typeof res === 'object') {
        chatMessages.value = res.messages || []
        contactInfo.value = res.contact || null
      }
    } catch (error) { showError(error) }
  }

  const sendMessage = async () => {
    const body = chatDraft.value.trim()
    if (!body || !selectedMatch.value || isSending.value) return
    isSending.value = true
    try {
      await $trpc.social.sendMessage.mutate({ matchId: selectedMatch.value.id, body })
      chatDraft.value = ''
      await Promise.all([loadChatMessages(), options.onMatchRefresh?.(), options.onQuestRefresh?.()])
    } catch (error) { showError(error) } finally { isSending.value = false }
  }

  const appendMessage = (message: any) => {
    const exists = chatMessages.value.some((m: any) => m.id === message.id)
    if (exists) return
    chatMessages.value = [...chatMessages.value, message].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }

  // --- Media helpers ---
  const parseVoice = (body: string) => {
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object' && parsed.audioUrl) return { audioUrl: parsed.audioUrl, durationSec: parsed.durationSec || 0 }
    } catch {}
    return { audioUrl: body, durationSec: 0 }
  }

  const mediaFromBody = (body: string) => {
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string' && (parsed.kind === 'image' || parsed.kind === 'video')) {
        return { url: parsed.url, kind: parsed.kind as 'image' | 'video', round: parsed.round === true, durationSec: Number(parsed.durationSec || 0), fileName: typeof parsed.fileName === 'string' ? parsed.fileName : '', size: Number(parsed.size || 0) }
      }
    } catch {}
    return null
  }

  const previewBody = (body: string, kind: string | null): string => {
    if (kind === 'voice') return t('dashboard.voiceMessage')
    if (kind === 'call') {
      try {
        const call = JSON.parse(body)
        if (call?.status === 'missed' || call?.status === 'rejected') return t('chats.missedCall')
        const sec = Number(call?.durationSec || 0)
        return sec > 0 ? `${t('chats.lastCall')} · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : t('chats.lastCall')
      } catch {
        return t('chats.lastCall')
      }
    }
    if (kind === 'contact') return t('chats.lastContact')
    const media = mediaFromBody(body)
    if (media?.kind === 'image') return t('chats.lastImage')
    if (media?.kind === 'video') return media.round ? t('dashboard.videoNote') : t('chats.lastVideo')
    const voice = parseVoice(body)
    if (voice.audioUrl) return t('dashboard.voiceMessage')
    return body
  }

  const renderedMessages = computed(() => chatMessages.value.map((message: any) => {
    const plain = message.kind === 'voice' || message.kind === 'call' || message.kind === 'contact' || message.kind === 'system'
    const media = plain ? null : mediaFromBody(message.body)
    return { message, media, shown: media?.kind ?? message.kind }
  }))

  const messageStatus = (message: any) => {
    if (message.senderId === getUserId()) {
      if (message.readAt) return t('dashboard.messageRead')
      if (message.deliveredAt) return t('dashboard.messageSent')
    }
    return ''
  }

  // --- Audio playback ---
  const audioPlayers = new Map<string, { audio: HTMLAudioElement; speed: number; playing: boolean; duration: number; currentTime: number }>()
  const activeVoiceMessageId = ref<string | null>(null)

  const getPlayer = (messageId: string, audioUrl: string, durationSec: number) => {
    let p = audioPlayers.get(messageId)
    if (!p) {
      const audio = new Audio(audioUrl)
      p = { audio, speed: 1, playing: false, duration: durationSec, currentTime: 0 }
      audio.playbackRate = p.speed
      audio.addEventListener('play', () => { p!.playing = true; activeVoiceMessageId.value = messageId })
      audio.addEventListener('pause', () => { p!.playing = false; if (activeVoiceMessageId.value === messageId) activeVoiceMessageId.value = null })
      audio.addEventListener('ended', () => { p!.playing = false; p!.currentTime = p!.duration; voiceProgress.value = { id: messageId, percent: 100 }; if (activeVoiceMessageId.value === messageId) activeVoiceMessageId.value = null })
      audio.addEventListener('timeupdate', () => { p!.currentTime = audio.currentTime; voiceProgress.value = { id: messageId, percent: p!.duration ? Math.min(100, (p!.currentTime / p!.duration) * 100) : 0 } })
      audio.addEventListener('error', () => { p!.playing = false; if (activeVoiceMessageId.value === messageId) activeVoiceMessageId.value = null })
      audioPlayers.set(messageId, p)
    }
    return p
  }

  const stopAllVoices = () => {
    audioPlayers.forEach((p) => { p.audio.pause(); p.audio.currentTime = 0; p.playing = false })
    activeVoiceMessageId.value = null
    voiceProgress.value = { id: '', percent: 0 }
  }

  const playVoice = (messageId: string, audioUrl: string, durationSec: number) => {
    stopAllVoices()
    const p = getPlayer(messageId, audioUrl, durationSec)
    p.audio.playbackRate = p.speed
    void p.audio.play()
  }

  const pauseVoice = (messageId: string) => {
    const p = audioPlayers.get(messageId)
    if (p) { p.audio.pause(); p.playing = false; if (activeVoiceMessageId.value === messageId) activeVoiceMessageId.value = null }
  }

  const togglePlaybackSpeed = (messageId: string) => {
    const p = audioPlayers.get(messageId)
    if (!p) return
    const speeds = [0.5, 1, 1.5, 2]
    const i = speeds.indexOf(p.speed)
    p.speed = speeds[(i + 1) % speeds.length]!
    p.audio.playbackRate = p.speed
  }

  const isVoicePlaying = (messageId: string) => {
    const p = audioPlayers.get(messageId)
    return Boolean(p && p.playing)
  }

  const voiceProgressPercent = (messageId: string) => voiceProgress.value.id === messageId ? Math.round(voiceProgress.value.percent) : 0
  const messageSpeed = (messageId: string) => audioPlayers.get(messageId)?.speed ?? 1

  // --- Pinned media ---
  const isPinned = (messageId: string) => pinnedMedia.value.some((m: any) => m.id === messageId)
  const togglePinMedia = (message: any) => {
    if (isPinned(message.id)) { pinnedMedia.value = pinnedMedia.value.filter((m: any) => m.id !== message.id) }
    else { pinnedMedia.value = [...pinnedMedia.value, message] }
  }

  // --- Notifications ---
  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const perm = await Notification.requestPermission()
    notificationPermission.value = perm as any
    notificationsEnabled.value = perm === 'granted'
  }

  const toggleNotifications = async () => {
    if (notificationsEnabled.value) { notificationsEnabled.value = false; return }
    await requestNotificationPermission()
  }

  const showNewMessageNotification = async (message: any, match: Match | null) => {
    if (!('Notification' in window) || notificationPermission.value !== 'granted') return
    const sender = match?.profile?.displayName || t('dashboard.newMessage')
    const media = mediaFromBody(message.body)
    const body = message.kind === 'voice' ? t('dashboard.voiceMessage') : media?.kind === 'video' ? t('dashboard.videoMessage') : media?.kind === 'image' ? t('dashboard.photoVideo') : message.body
    try { new Notification(t('dashboard.newMessage'), { body, icon: '/favicon.ico', tag: `constella-msg-${match?.id}` }) } catch {}
  }

  // --- Contact sharing ---
  const shareContact = async () => {
    if (!selectedMatch.value || isSharingContact.value) return
    isSharingContact.value = true
    try {
      const res = await $trpc.social.shareContact.mutate({ matchId: selectedMatch.value.id })
      toast(res.mutual ? t('dashboard.contactMutual') : t('dashboard.contactSent'))
      await loadChatMessages()
    } catch (err) { showError(err) } finally { isSharingContact.value = false }
  }

  // --- Open/close chat ---
  const openChat = (match: Match) => {
    selectedMatch.value = match
    void loadChatMessages()
    if (match.id) void connectRealtime(match.id)
  }

  const closeChat = () => {
    closeRealtime()
    stopAllVoices()
    selectedMatch.value = null
    chatMessages.value = []
  }

  // --- Send media ---
  const sendMediaMessage = async (file: File) => {
    if (!selectedMatch.value || isSending.value) return
    const media = mediaKindOf({ type: file.type, name: file.name })
    if (!media) { toast(t('dashboard.mediaUnsupported')); return }
    const isVideo = media.kind === 'video'
    isSending.value = true
    try {
      const uploadMeta = isVideo
        ? await $trpc.photos.createVideoUpload.mutate({ contentType: media.contentType as 'video/mp4' | 'video/webm' })
        : await $trpc.photos.createUpload.mutate({ contentType: media.contentType as 'image/jpeg' | 'image/png' | 'image/webp' })
      // PUT і confirm мусять оголошувати той самий тип, що й підписаний запит: `confirmUpload`
      // порівнює збережений `head.ContentType` і відхиляє об'єкт при розбіжності.
      await fetch(uploadMeta.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': media.contentType } })
      const processed = isVideo
        ? await $trpc.photos.confirmVideoUpload.mutate({ objectKey: uploadMeta.objectKey, contentType: media.contentType as 'video/mp4' | 'video/webm' })
        : await $trpc.photos.confirmUpload.mutate({ objectKey: uploadMeta.objectKey, contentType: media.contentType as 'image/jpeg' | 'image/png' | 'image/webp' })
      await $trpc.social.sendMessage.mutate({ matchId: selectedMatch.value.id, body: JSON.stringify({ kind: media.kind, url: processed.publicUrl, fileName: file.name, size: file.size }) })
      await loadChatMessages()
    } catch (err) { showError(err) } finally { isSending.value = false }
  }

  return {
    // State
    selectedMatch, chatMessages, chatDraft, isLoading, isSending,
    wsConnected, realtimeTransport, peerTyping, contactInfo, isSharingContact,
    pinnedMedia, notificationPermission, notificationsEnabled,
    // Actions
    openChat, closeChat, loadChatMessages, sendMessage, appendMessage,
    connectRealtime, closeRealtime, loadRealtimeConfig, onComposerInput,
    shareContact, sendMediaMessage,
    // Audio
    playVoice, pauseVoice, togglePlaybackSpeed, isVoicePlaying,
    voiceProgressPercent, messageSpeed, stopAllVoices,
    // Helpers
    parseVoice, mediaFromBody, previewBody, renderedMessages,
    messageStatus, isPinned, togglePinMedia,
    // Notifications
    toggleNotifications, requestNotificationPermission,
    // i18n
    t, locale,
  }
}
