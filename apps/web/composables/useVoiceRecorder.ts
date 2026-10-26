import { computed, nextTick, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

const MAX_VOICE_SEC = 300
const MAX_NOTE_SEC = 60
const MIN_HOLD_MS = 400

export interface VoiceRecorderOptions {
  onToast?: (msg: string) => void
  onSend?: (type: 'voice' | 'note', payload: any) => Promise<void>
  getSelectedMatchId?: () => string | null
}

export function useVoiceRecorder(options: VoiceRecorderOptions = {}) {
  const { $trpc } = useNuxtApp() as any
  const { t } = useLocale()

  const toast = (msg: string) => options.onToast?.(msg)

  // --- State ---
  const chatMode = ref<'voice' | 'note'>('voice')
  const isRecording = ref(false)
  const isRecordingVideo = ref(false)
  const recordingDuration = ref(0)
  const recordingVideoDuration = ref(0)
  const holdCancelling = ref(false)
  const noteStream = ref<MediaStream | null>(null)
  const notePreview = ref<HTMLVideoElement | null>(null)
  const isSending = ref(false)

  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let videoChunks: Blob[] = []
  let recordingTimer: number | null = null
  let recordingVideoTimer: number | null = null
  let holdStartedAt = 0
  let holdOrigin = { x: 0, y: 0 }

  // --- Format helper ---
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // --- Hold label ---
  const holdLabel = computed(() => {
    const live = isRecording.value || isRecordingVideo.value
    if (!live) return t(chatMode.value === 'note' ? 'dashboard.holdToNote' : 'dashboard.holdToRecord')
    if (holdCancelling.value) return t('dashboard.slideToCancel')
    const seconds = isRecordingVideo.value ? recordingVideoDuration.value : recordingDuration.value
    return `${t('dashboard.releaseToSend')} · ${formatDuration(seconds)}`
  })

  // --- Voice recording ---
  const startVoiceRecording = async () => {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      toast(t('dashboard.voiceUnsupported'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      mediaRecorder = new MediaRecorder(stream, { mimeType })
      audioChunks = []
      recordingDuration.value = 0
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data) }
      mediaRecorder.start(100)
      isRecording.value = true
      recordingTimer = window.setInterval(() => {
        recordingDuration.value += 1
        if (recordingDuration.value >= MAX_VOICE_SEC) void stopVoiceRecording(true)
      }, 1000)
    } catch (error: any) { toast(error?.message) }
  }

  const stopVoiceRecording = async (send = true) => {
    if (!mediaRecorder || !isRecording.value) return
    if (recordingTimer) clearInterval(recordingTimer)
    isRecording.value = false
    const duration = recordingDuration.value || 1
    mediaRecorder.onstop = async () => {
      mediaRecorder?.stream?.getTracks().forEach((t) => t.stop())
      if (!send || audioChunks.length === 0) return
      const matchId = options.getSelectedMatchId?.()
      if (!matchId) return
      const mime = mediaRecorder?.mimeType || 'audio/webm'
      const blob = new Blob(audioChunks, { type: mime })
      isSending.value = true
      try {
        let audioUrl: string | null = null
        try {
          const uploadMeta = await $trpc.photos.createVoiceUpload.mutate({ contentType: mime as any })
          await fetch(uploadMeta.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': mime } })
          const processed = await $trpc.photos.confirmVoiceUpload.mutate({ objectKey: uploadMeta.objectKey, contentType: mime as any })
          audioUrl = processed.publicUrl
        } catch {
          audioUrl = await new Promise<string>((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result as string); r.readAsDataURL(blob) })
        }
        if (audioUrl) {
          await options.onSend?.('voice', { matchId, audioUrl, durationSec: duration })
        }
      } catch (err: any) { toast(err?.message) } finally { isSending.value = false }
    }
    mediaRecorder.stop()
  }

  const cancelVoiceRecording = () => { void stopVoiceRecording(false) }

  // --- Note recording ---
  const startNoteRecording = async () => {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast(t('dashboard.voiceUnsupported'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } }, audio: true })
      noteStream.value = stream
      const mime = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4'
      mediaRecorder = new MediaRecorder(stream, { mimeType: mime })
      videoChunks = []
      recordingVideoDuration.value = 0
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunks.push(e.data) }
      mediaRecorder.start(250)
      isRecordingVideo.value = true
      recordingVideoTimer = window.setInterval(() => {
        recordingVideoDuration.value += 1
        if (recordingVideoDuration.value >= MAX_NOTE_SEC) void stopNoteRecording(true)
      }, 1000)
      await nextTick()
      void notePreview.value?.play()
    } catch (error: any) { toast(error?.message) }
  }

  const stopNoteRecording = async (send = true) => {
    if (!mediaRecorder || !isRecordingVideo.value) return
    if (recordingVideoTimer) clearInterval(recordingVideoTimer)
    isRecordingVideo.value = false
    const duration = recordingVideoDuration.value || 1
    mediaRecorder.onstop = async () => {
      mediaRecorder?.stream?.getTracks().forEach((t) => t.stop())
      noteStream.value = null
      if (!send || videoChunks.length === 0) return
      const matchId = options.getSelectedMatchId?.()
      if (!matchId) return
      const mime = (mediaRecorder?.mimeType || 'video/webm').split(';')[0]!
      const extension = mime === 'video/mp4' ? 'mp4' : 'webm'
      const blob = new Blob(videoChunks, { type: mime })
      isSending.value = true
      try {
        const uploadMeta = await $trpc.photos.createVideoUpload.mutate({ contentType: mime as 'video/mp4' | 'video/webm' })
        await fetch(uploadMeta.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': mime } })
        const processed = await $trpc.photos.confirmVideoUpload.mutate({ objectKey: uploadMeta.objectKey, contentType: mime as 'video/mp4' | 'video/webm' })
        await options.onSend?.('note', { matchId, body: JSON.stringify({ kind: 'video', round: true, url: processed.publicUrl, fileName: `note-${Date.now()}.${extension}`, size: blob.size, durationSec: duration }) })
      } catch (err: any) { toast(err?.message) } finally { isSending.value = false }
    }
    mediaRecorder.stop()
  }

  const cancelNoteRecording = () => { void stopNoteRecording(false) }

  // --- Hold handlers ---
  const onHoldStart = (event: PointerEvent) => {
    if (isSending.value) return
    const target = event.currentTarget as HTMLElement | null
    target?.setPointerCapture?.(event.pointerId)
    holdOrigin = { x: event.clientX, y: event.clientY }
    holdStartedAt = Date.now()
    holdCancelling.value = false
    if (chatMode.value === 'note') void startNoteRecording()
    else void startVoiceRecording()
  }

  const onHoldMove = (event: PointerEvent) => {
    if (!isRecording.value && !isRecordingVideo.value) return
    const up = holdOrigin.y - event.clientY
    const aside = Math.abs(event.clientX - holdOrigin.x)
    holdCancelling.value = up > 60 || aside > 120
  }

  const onHoldEnd = () => {
    const tooShort = Date.now() - holdStartedAt < MIN_HOLD_MS
    const keep = !holdCancelling.value && !tooShort
    const mode = chatMode.value
    if (mode === 'note') void stopNoteRecording(keep)
    else void stopVoiceRecording(keep)
    holdCancelling.value = false
    if (tooShort) toast(t(mode === 'note' ? 'dashboard.holdToNote' : 'dashboard.holdToRecord'))
  }

  const onHoldCancel = () => {
    if (chatMode.value === 'note') void cancelNoteRecording()
    else void cancelVoiceRecording()
    holdCancelling.value = false
  }

  // --- Record button unified handlers ---
  const cycleChatMode = () => {
    if (isRecording.value || isRecordingVideo.value) return
    chatMode.value = chatMode.value === 'voice' ? 'note' : 'voice'
  }

  const onRecordPointerDown = (event: PointerEvent) => {
    if (isSending.value) return
    onHoldStart(event)
  }

  const onRecordPointerUp = () => {
    const elapsed = Date.now() - holdStartedAt
    if (elapsed < MIN_HOLD_MS) {
      if (isRecording.value) void cancelVoiceRecording()
      if (isRecordingVideo.value) void cancelNoteRecording()
      cycleChatMode()
      holdCancelling.value = false
      return
    }
    onHoldEnd()
  }

  const onRecordPointerCancel = () => { onHoldCancel() }

  return {
    chatMode, isRecording, isRecordingVideo,
    recordingDuration, recordingVideoDuration,
    holdCancelling, noteStream, notePreview, isSending,
    holdLabel, formatDuration,
    onRecordPointerDown, onRecordPointerUp, onRecordPointerCancel,
    onHoldMove, cycleChatMode,
    startNoteRecording, stopNoteRecording, cancelNoteRecording,
    startVoiceRecording, stopVoiceRecording, cancelVoiceRecording,
    MIN_HOLD_MS,
  }
}
