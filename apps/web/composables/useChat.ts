import { computed, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

type Match = {
  id: string
  createdAt: string
  profile: { id: string; displayName: string; city: string | null } | null
  lastMessage: { body: string; kind: string | null; sentByMe: boolean; createdAt: string } | null
}

export interface ChatOptions {
  onToast?: (msg: string) => void
  onMatchRefresh?: () => Promise<void>
  onQuestRefresh?: () => Promise<void>
  getUserId?: () => string | undefined
  onCallIncoming?: (payload: { roomId: string; callType: 'audio' | 'video'; fromId: string; fromName: string; token: string }) => void
  onCallEnded?: () => void
  defaultPeerName?: string
}

export function useChat(options: ChatOptions = {}) {
  const { $trpc } = useNuxtApp() as any
  const runtimeConfig = useRuntimeConfig()
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
  const wsConnected = ref(false)
  const peerTyping = ref(false)
  const contactInfo = ref<{ offeredByMe: boolean; mutual: boolean; usernames: string[] } | null>(null)
  const isSharingContact = ref(false)
  const pinnedMedia = ref<any[]>([])
  const notificationPermission = ref<'default' | 'granted' | 'denied'>('default')
  const notificationsEnabled = ref(false)
  const voiceProgress = ref<{ id: string; percent: number }>({ id: '', percent: 0 })

  // --- WS ---
  let chatWs: WebSocket | null = null
  let wsReconnectTimer: number | null = null
  const apiBase = (runtimeConfig.public.apiBase as string) || ''
  const wsUrl = apiBase.startsWith('http')
    ? apiBase.replace(/^http/, 'ws')
    : `ws://${window.location.hostname}:4000`

  const closeChatWs = () => {
    if (wsReconnectTimer) { window.clearInterval(wsReconnectTimer); wsReconnectTimer = null }
    if (chatWs) { chatWs.close(); chatWs = null }
    wsConnected.value = false
  }

  const sendWs = (payload: any) => {
    if (chatWs && chatWs.readyState === WebSocket.OPEN) chatWs.send(JSON.stringify(payload))
  }

  const connectChatWs = (matchId: string) => {
    closeChatWs()
    wsConnected.value = false
    try {
      const token = localStorage.getItem('constella_token') || ''
      const params = new URLSearchParams({ matchId })
      if (token) params.set('token', token)
      chatWs = new WebSocket(`${wsUrl}/api/chat/ws?${params.toString()}`)
      chatWs.binaryType = 'arraybuffer'
      chatWs.onopen = () => {
        wsConnected.value = true
        if (wsReconnectTimer) { window.clearInterval(wsReconnectTimer); wsReconnectTimer = null }
        void loadChatMessages()
      }
      chatWs.onmessage = (event) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : null
          if (!data) return
          if (data.type === 'error') {
            if (data.code === 'rate_limited') showError({ message: data.message })
            return
          }
          if (data.type === 'chat.message') {
            appendMessage(data.message)
            const incoming = data.message
            if (incoming && incoming.senderId !== getUserId() && selectedMatch.value && incoming.matchId === selectedMatch.value.id && document.visibilityState === 'visible') {
              sendWs({ type: 'send.read', matchId: selectedMatch.value.id, messageId: incoming.id })
            }
          } else if (data.type === 'chat.typing') {
            peerTyping.value = true
            window.setTimeout(() => { peerTyping.value = false }, 3000)
          } else if (data.type === 'call.incoming') {
            options.onCallIncoming?.({ roomId: data.roomId, callType: data.callType, fromId: data.fromId, fromName: data.fromName, token: data.token })
          } else if (data.type === 'call.ended') {
            options.onCallEnded?.()
          } else if (data.type === 'presence.read') {
            const m = chatMessages.value.find((x: any) => x.id === data.messageId)
            if (m) m.readAt = data.readAt
          }
          if (notificationsEnabled.value && data.type === 'chat.message' && data.message.senderId !== getUserId() && document.visibilityState !== 'visible') {
            void showNewMessageNotification(data.message, selectedMatch.value)
          }
        } catch {}
      }
      chatWs.onclose = () => {
        wsConnected.value = false
        wsReconnectTimer = window.setInterval(() => { void connectChatWs(matchId) }, 3000)
      }
      chatWs.onerror = () => { wsConnected.value = false }
    } catch { wsConnected.value = false }
  }

  // --- Typing ---
  let lastTypingSentAt = 0
  const onComposerInput = () => {
    if (!selectedMatch.value || !wsConnected.value) return
    const now = Date.now()
    if (now - lastTypingSentAt < 1500) return
    lastTypingSentAt = now
    sendWs({ type: 'send.typing', matchId: selectedMatch.value.id })
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
    if (kind === 'call') return t('chats.lastCall')
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
    if (match.id) void connectChatWs(match.id)
  }

  const closeChat = () => {
    closeChatWs()
    stopAllVoices()
    selectedMatch.value = null
    chatMessages.value = []
  }

  // --- Send media ---
  const sendMediaMessage = async (file: File) => {
    if (!selectedMatch.value || isSending.value) return
    const isVideo = file.type.startsWith('video/')
    if (!isVideo && !file.type.startsWith('image/')) return
    isSending.value = true
    try {
      const kind = isVideo ? 'video' : 'image'
      const uploadMeta = isVideo
        ? await $trpc.photos.createVideoUpload.mutate({ contentType: file.type as 'video/mp4' | 'video/webm' })
        : await $trpc.photos.createUpload.mutate({ contentType: file.type as any })
      await fetch(uploadMeta.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      const processed = isVideo
        ? await $trpc.photos.confirmVideoUpload.mutate({ objectKey: uploadMeta.objectKey, contentType: file.type as 'video/mp4' | 'video/webm' })
        : await $trpc.photos.confirmUpload.mutate({ objectKey: uploadMeta.objectKey, contentType: file.type as any })
      await $trpc.social.sendMessage.mutate({ matchId: selectedMatch.value.id, body: JSON.stringify({ kind, url: processed.publicUrl, fileName: file.name, size: file.size }) })
      await loadChatMessages()
    } catch (err) { showError(err) } finally { isSending.value = false }
  }

  return {
    // State
    selectedMatch, chatMessages, chatDraft, isLoading, isSending,
    wsConnected, peerTyping, contactInfo, isSharingContact,
    pinnedMedia, notificationPermission, notificationsEnabled,
    // Actions
    openChat, closeChat, loadChatMessages, sendMessage, appendMessage,
    connectChatWs, closeChatWs, sendWs, onComposerInput,
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
