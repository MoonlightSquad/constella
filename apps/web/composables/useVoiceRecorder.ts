import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'
import { CONSENT_STORAGE_KEY, decideCancel, decideHoldAction, isTelegramWebview, isVoiceUploadable, normalizeMime, pickAudioMime, pickVideoMime } from './media-decisions.mjs'

const MAX_VOICE_SEC = 300
const MAX_NOTE_SEC = 60
const MIN_HOLD_MS = 400
const NOTE_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
  audio: true,
}

type WarmMode = 'voice' | 'note'

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
  const isSending = ref(false)
  /** Палець досі притиснутий. Єдині ворота для будь-якого старту після `await`. */
  const holdActive = ref(false)
  /** Діалог дозволу з'їдає жест: реліз під час нього — не «короткий тап». */
  const awaitingPermission = ref(false)

  let liveStream: MediaStream | null = null
  /** Стріми, відкриті наперед: мікрофон на кімнату, камера+мікрофон на режим ⭕. */
  const warmStreams: Record<WarmMode, MediaStream | null> = { voice: null, note: null }
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let videoChunks: Blob[] = []
  let recordingTimer: number | null = null
  let recordingVideoTimer: number | null = null
  let holdStartedAt = 0
  let holdOrigin = { x: 0, y: 0 }

  /** Теплі стріми мають сенс лише там, де дозвіл видається на кожен запит. */
  const keepWarm = () => typeof window !== 'undefined' && isTelegramWebview(navigator.userAgent)
  const isLive = (stream: MediaStream | null) => Boolean(stream && stream.getTracks().every((track) => track.readyState === 'live'))

  const warmKeyOf = (stream: MediaStream | null): WarmMode | null =>
    stream && stream === warmStreams.voice ? 'voice' : stream && stream === warmStreams.note ? 'note' : null

  const dropWarm = (mode?: WarmMode) => {
    const keys: WarmMode[] = mode ? [mode] : ['voice', 'note']
    for (const key of keys) {
      warmStreams[key]?.getTracks().forEach((track) => track.stop())
      warmStreams[key] = null
    }
  }

  const releaseStream = () => {
    awaitingPermission.value = false
    const key = warmKeyOf(liveStream)
    const reusable = Boolean(key) && keepWarm() && isLive(key ? warmStreams[key] : null)
    if (!reusable) liveStream?.getTracks().forEach((track) => track.stop())
    liveStream = null
    noteStream.value = null
  }

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

  const unsupported = () => {
    toast(t('dashboard.voiceUnsupported'))
    return null
  }

  /**
   * `getUserMedia` резолвиться після того, як системний діалог уже забрав pointer-потік,
   * тому викликані звідси record-старти завжди перечитують `holdActive`.
   * Теплий стрім повертається синхронно: жест діалог не з'їдає.
   */
  const acquire = async (constraints: MediaStreamConstraints, mode: WarmMode): Promise<MediaStream | null> => {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return unsupported()
    }
    const cached = keepWarm() ? warmStreams[mode] : null
    if (isLive(cached)) {
      liveStream = cached
      return cached
    }
    awaitingPermission.value = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      liveStream = stream
      if (keepWarm()) warmStreams[mode] = stream
      // Telegram питає власний дозвіл саме тут: без цього запису стартовий `denied`
      // лишився б і подальші помилки читались би як «немає доступу».
      localStorage.setItem(CONSENT_STORAGE_KEY, 'granted')
      return stream
    } catch (error: any) {
      releaseStream()
      const previouslyDenied = localStorage.getItem(CONSENT_STORAGE_KEY) === 'denied'
      toast(previouslyDenied ? t('dashboard.callMicDenied') : (error?.message || t('dashboard.voiceUnsupported')))
      return null
    }
  }

  /**
   * Відкриває пристрій заздалегідь: мікрофон — на вході в кімнату, камеру разом з
   * мікрофоном — на переході в режим ⭕. Обидва тапи вже витрачені на UI, тож діалог
   * Telegram нічого не краде, а наступне затискання пише відразу.
   * Поза WebView Telegram не робить нічого: там grant пам'ятається, і тримати
   * гарячу камеру без потреби не було б сенсу.
   */
  const warmUp = (mode: WarmMode = 'voice') => {
    if (!keepWarm() || typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) return
    if (isLive(warmStreams[mode]) || isRecording.value || isRecordingVideo.value) return
    void navigator.mediaDevices.getUserMedia(mode === 'voice' ? { audio: true } : NOTE_CONSTRAINTS)
      .then((stream) => {
        warmStreams[mode] = stream
        localStorage.setItem(CONSENT_STORAGE_KEY, 'granted')
      })
      .catch(() => { /* затискання по кнопці все одно покаже діалог */ })
  }

  /** Деякі рушії підтверджують тип в `isTypeSupported`, але кидають у конструкторі. */
  const createRecorder = (stream: MediaStream, mime: string) => {
    try {
      return new MediaRecorder(stream, mime ? { mimeType: mime } : {})
    } catch {
      return new MediaRecorder(stream)
    }
  }

  const toDataUrl = (blob: Blob) => new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })

  /**
   * Розв'язка «жест з'їв діалог дозволу» — рівно один раз: інакше `pointerup` і пізній
   * резолв `getUserMedia` перемикали б режим двічі.
   */
  let holdSettled = false
  const settleConsumedHold = (wasTap: boolean) => {
    if (holdSettled) return
    holdSettled = true
    holdActive.value = false
    holdCancelling.value = false
    if (wasTap) cycleChatMode()
    else toast(t(chatMode.value === 'note' ? 'dashboard.holdToNote' : 'dashboard.holdToRecord'))
  }

  // --- Voice recording ---
  const startVoiceRecording = async () => {
    const stream = await acquire({ audio: true }, 'voice')
    if (!stream) return
    if (!holdActive.value) {
      releaseStream()
      return settleConsumedHold(false)
    }
    const mime = pickAudioMime((type) => MediaRecorder.isTypeSupported(type))
    const recorder = createRecorder(stream, mime)
    audioChunks = []
    recordingDuration.value = 0
    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data) }
    try {
      recorder.start(100)
    } catch {
      releaseStream()
      return unsupported()
    }
    mediaRecorder = recorder
    isRecording.value = true
    awaitingPermission.value = false
    recordingTimer = window.setInterval(() => {
      recordingDuration.value += 1
      if (recordingDuration.value >= MAX_VOICE_SEC) void stopVoiceRecording(true)
    }, 1000)
  }

  const stopVoiceRecording = async (send = true) => {
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null }
    isRecording.value = false
    const recorder = mediaRecorder
    mediaRecorder = null
    if (!recorder) return releaseStream()
    const duration = recordingDuration.value || 1
    // `recorder.mimeType` несе кодеки: API хоче голий тип, а `Blob` — повний, як і `Content-Type` PUT.
    const rawMime = recorder.mimeType || 'audio/webm'
    const contentType = normalizeMime(rawMime)
    recorder.onstop = async () => {
      releaseStream()
      if (!send || audioChunks.length === 0) return
      const matchId = options.getSelectedMatchId?.()
      if (!matchId) return
      const blob = new Blob(audioChunks, { type: rawMime })
      isSending.value = true
      try {
        let audioUrl: string
        if (isVoiceUploadable(contentType)) {
          try {
            const uploadMeta = await $trpc.photos.createVoiceUpload.mutate({ contentType })
            await fetch(uploadMeta.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } })
            const processed = await $trpc.photos.confirmVoiceUpload.mutate({ objectKey: uploadMeta.objectKey, contentType })
            audioUrl = processed.publicUrl
          } catch {
            audioUrl = await toDataUrl(blob)
          }
        } else {
          audioUrl = await toDataUrl(blob)
        }
        await options.onSend?.('voice', { matchId, audioUrl, durationSec: duration })
      } catch (err: any) { toast(err?.message) } finally { isSending.value = false }
    }
    recorder.stop()
  }

  const cancelVoiceRecording = () => { void stopVoiceRecording(false) }

  // --- Note recording ---
  const startNoteRecording = async () => {
    const stream = await acquire(NOTE_CONSTRAINTS, 'note')
    if (!stream) return
    if (!holdActive.value) {
      releaseStream()
      return settleConsumedHold(false)
    }
    noteStream.value = stream
    const mime = pickVideoMime((type) => MediaRecorder.isTypeSupported(type))
    const recorder = createRecorder(stream, mime)
    videoChunks = []
    recordingVideoDuration.value = 0
    recorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunks.push(e.data) }
    try {
      recorder.start(250)
    } catch {
      releaseStream()
      return unsupported()
    }
    mediaRecorder = recorder
    isRecordingVideo.value = true
    awaitingPermission.value = false
    recordingVideoTimer = window.setInterval(() => {
      recordingVideoDuration.value += 1
      if (recordingVideoDuration.value >= MAX_NOTE_SEC) void stopNoteRecording(true)
    }, 1000)
  }

  const stopNoteRecording = async (send = true) => {
    if (recordingVideoTimer) { clearInterval(recordingVideoTimer); recordingVideoTimer = null }
    isRecordingVideo.value = false
    const recorder = mediaRecorder
    mediaRecorder = null
    if (!recorder) return releaseStream()
    const duration = recordingVideoDuration.value || 1
    const contentType = normalizeMime(recorder.mimeType) || 'video/webm'
    const extension = contentType === 'video/mp4' ? 'mp4' : 'webm'
    recorder.onstop = async () => {
      releaseStream()
      if (!send || videoChunks.length === 0) return
      const matchId = options.getSelectedMatchId?.()
      if (!matchId) return
      // `confirmVideoUpload` звіряє точний `Content-Type`, тому `Blob` і заголовок беруть той самий тип.
      const blob = new Blob(videoChunks, { type: contentType })
      isSending.value = true
      try {
        const uploadMeta = await $trpc.photos.createVideoUpload.mutate({ contentType })
        await fetch(uploadMeta.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } })
        const processed = await $trpc.photos.confirmVideoUpload.mutate({ objectKey: uploadMeta.objectKey, contentType })
        await options.onSend?.('note', { matchId, body: JSON.stringify({ kind: 'video', round: true, url: processed.publicUrl, fileName: `note-${Date.now()}.${extension}`, size: blob.size, durationSec: duration }) })
      } catch (err: any) { toast(err?.message) } finally { isSending.value = false }
    }
    recorder.stop()
  }

  const cancelNoteRecording = () => { void stopNoteRecording(false) }

  // --- Hold handlers ---
  const onHoldStart = (event: PointerEvent) => {
    if (isSending.value) return
    // Другий палець по тій самій кнопці інакше перезаписав би `mediaRecorder` і залишив
    // перший запис із гарячим мікрофоном.
    if (isRecording.value || isRecordingVideo.value) return
    const target = event.currentTarget as HTMLElement | null
    target?.setPointerCapture?.(event.pointerId)
    holdOrigin = { x: event.clientX, y: event.clientY }
    holdStartedAt = Date.now()
    holdCancelling.value = false
    holdActive.value = true
    holdSettled = false
    if (chatMode.value === 'note') void startNoteRecording()
    else void startVoiceRecording()
  }

  const onHoldMove = (event: PointerEvent) => {
    if (!holdActive.value && !isRecording.value && !isRecordingVideo.value) return
    holdCancelling.value = decideCancel({
      dx: event.clientX - holdOrigin.x,
      dy: event.clientY - holdOrigin.y,
    })
  }

  const onHoldEnd = () => {
    if (isRecordingVideo.value) void stopNoteRecording(true)
    else void stopVoiceRecording(true)
    holdCancelling.value = false
  }

  /**
   * Гілка за фактом запису, а не за `chatMode`: чип ⭕ у меню 📎 вміє змінити режим,
   * коли запис уже йде.
   *
   * `lostpointercapture` приходить слідом за `pointerup`, коли запис уже відданий
   * `recorder.stop()`: зупинити стрімі раніше за `onstop` — означатиме обрізаний файл.
   */
  const cancelLiveRecording = () => {
    const live = holdActive.value || isRecording.value || isRecordingVideo.value
    // Поки висить діалог дозволу, це ще не розв'язка жесту: її дасть пізній резолв
    // `getUserMedia`, інакше користувач не побачив би на екрані нічого.
    if (live && !awaitingPermission.value) holdSettled = true
    holdActive.value = false
    holdCancelling.value = false
    if (!live) return
    if (isRecordingVideo.value) void cancelNoteRecording()
    else if (isRecording.value) void cancelVoiceRecording()
    // Стрім уже взято, а `MediaRecorder` ще ні — це діалог дозволу, пускати його у запис не можна.
    else releaseStream()
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
    const elapsedMs = Date.now() - holdStartedAt
    const action = decideHoldAction({
      elapsedMs,
      awaitingPermission: awaitingPermission.value,
      cancelling: holdCancelling.value,
      minMs: MIN_HOLD_MS,
    })
    holdActive.value = false
    if (action === 'dismiss') {
      // Діалог забрав pointer-потік: короткий тап усе одно був наміром перемкнути режим.
      return settleConsumedHold(elapsedMs < MIN_HOLD_MS)
    }
    holdSettled = true
    if (action === 'send') return onHoldEnd()
    cancelLiveRecording()
    if (action === 'tooShort') cycleChatMode()
  }

  const onRecordPointerCancel = () => { cancelLiveRecording() }

  /** Згорнутий екран: `pointerup` може не дійти, а мікрофон лишитися гарячим. */
  const abandonHold = () => {
    if (document.visibilityState !== 'hidden') return
    cancelLiveRecording()
    // Фонове вікно не тримає пристрій: наступний запис open'отно попросить дозвіл.
    dropWarm()
  }

  // Діалог дозволу на мікрофон знімає фокус і часто забирає останній pointer-івент:
  // без цього резолв `getUserMedia` стартував би запис, коли пальця вже немає.
  const abandonOnBlur = () => {
    if (awaitingPermission.value) cancelLiveRecording()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', abandonHold)
    window.addEventListener('blur', abandonOnBlur)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', abandonHold)
    window.removeEventListener('blur', abandonOnBlur)
    if (recordingTimer) clearInterval(recordingTimer)
    if (recordingVideoTimer) clearInterval(recordingVideoTimer)
    cancelLiveRecording()
    dropWarm()
  })

  return {
    chatMode, isRecording, isRecordingVideo,
    recordingDuration, recordingVideoDuration,
    holdCancelling, noteStream, isSending,
    holdLabel, formatDuration,
    onRecordPointerDown, onRecordPointerUp, onRecordPointerCancel,
    onHoldMove, cycleChatMode, cancelLiveRecording, warmUp, dropWarm,
    startNoteRecording, stopNoteRecording, cancelNoteRecording,
    startVoiceRecording, stopVoiceRecording, cancelVoiceRecording,
    MIN_HOLD_MS,
  }
}
