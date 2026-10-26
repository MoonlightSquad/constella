import { ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

export type CallPhase = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

export interface CallRoomHooks {
  onToast?: (msg: string) => void
  onPeerLeft?: () => void
}

/**
 * Обгортка над LiveKit `Room`. `livekit-client` імпортується лише динамічно:
 * модуль чіпляє `window`/`document`, а ChatPanel рендериться й на сервері.
 */
export function useCallRoom(hooks: CallRoomHooks = {}) {
  const { t } = useLocale()
  const phase = ref<CallPhase>('idle')
  const micEnabled = ref(true)
  const camEnabled = ref(false)
  const peerPresent = ref(false)
  /** Локальний превʼю — тільки відео; власний мікрофон відтворювати не треба. */
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)

  let room: import('livekit-client').Room | null = null
  let closing = false

  const toast = (msg: string) => hooks.onToast?.(msg)

  const mediaUnavailable = () => !navigator?.mediaDevices?.getUserMedia

  const describeStartError = (error: any): string => {
    const name = error?.name ?? ''
    if (name === 'NotAllowedError' || name === 'SecurityError') return t('dashboard.callMicDenied')
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('dashboard.callDeviceMissing')
    return error?.message || t('dashboard.callFailed')
  }

  const publishLocalVideo = async (callType: 'audio' | 'video') => {
    if (callType !== 'video' || !room) return
    const { Track } = await import('livekit-client')
    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack
    localStream.value = track ? new MediaStream([track.mediaStreamTrack]) : null
  }

  const connect = async (params: { url: string; token: string; callType: 'audio' | 'video' }) => {
    if (mediaUnavailable()) {
      toast(t('dashboard.voiceUnsupported'))
      return false
    }
    await disconnect()
    closing = false
    phase.value = 'connecting'
    micEnabled.value = true
    camEnabled.value = params.callType === 'video'

    try {
      const { Room, RoomEvent, Track } = await import('livekit-client')
      room = new Room({ adaptiveStream: true, dynacast: params.callType === 'video' })

      const syncPeer = () => { peerPresent.value = Boolean(room?.remoteParticipants.size) }
      room.on(RoomEvent.Connected, syncPeer)
      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (track.kind === Track.Kind.Video) remoteStream.value = new MediaStream([track.mediaStreamTrack])
        else track.attach()
      })
      room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
        if (track.kind === Track.Kind.Video) remoteStream.value = null
        else track.detach()
      })
      room.on(RoomEvent.ParticipantConnected, syncPeer)
      room.on(RoomEvent.ParticipantDisconnected, () => {
        syncPeer()
        hooks.onPeerLeft?.()
      })
      room.on(RoomEvent.Reconnecting, () => {
        phase.value = 'reconnecting'
      })
      room.on(RoomEvent.Reconnected, () => {
        phase.value = 'connected'
      })
      room.on(RoomEvent.Disconnected, () => {
        if (closing) return
        phase.value = 'failed'
        toast(t('dashboard.callDisconnected'))
      })

      await room.connect(params.url, params.token)
      await room.localParticipant.setMicrophoneEnabled(true)
      if (params.callType === 'video') await room.localParticipant.setCameraEnabled(true)
      await publishLocalVideo(params.callType)
      phase.value = 'connected'
      return true
    } catch (error: any) {
      phase.value = 'failed'
      toast(describeStartError(error))
      await disconnect()
      return false
    }
  }

  const disconnect = async () => {
    closing = true
    const current = room
    room = null
    try {
      // stopTracks=true гасить індикатор камери/мікрофона — інакше він світиться після завершення.
      await current?.disconnect(true)
    } catch {}
    localStream.value = null
    remoteStream.value = null
    peerPresent.value = false
    phase.value = 'idle'
  }

  const toggleMic = async () => {
    if (!room) return
    const next = !micEnabled.value
    try {
      await room.localParticipant.setMicrophoneEnabled(next)
      micEnabled.value = next
    } catch (error: any) {
      toast(error?.message || t('dashboard.callFailed'))
    }
  }

  const toggleCam = async () => {
    if (!room) return
    const next = !camEnabled.value
    try {
      await room.localParticipant.setCameraEnabled(next)
      camEnabled.value = next
      if (next) await publishLocalVideo('video')
      else localStream.value = null
    } catch (error: any) {
      toast(describeStartError(error))
    }
  }

  return {
    phase,
    micEnabled,
    camEnabled,
    peerPresent,
    localStream,
    remoteStream,
    connect,
    disconnect,
    toggleMic,
    toggleCam,
  }
}
