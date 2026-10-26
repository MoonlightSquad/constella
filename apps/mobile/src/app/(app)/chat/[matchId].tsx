import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { TRPCClientError } from '@trpc/client';

import { MediaError, pickFromCamera, pickFromGallery, pickVideoFromCamera, uploadChatImage, uploadChatVideo, uploadVoice } from '@/api/media';
import { useChatSocket, type ChatFrame, type ChatSocketHandle } from '@/api/realtime';
import { trpc } from '@/api/trpc';
import { displayKind, mediaFromBody, parseVoice, type ChatMessage } from '@/api/types';
import { useSession } from '@/auth/session';
import { Notice } from '@/components/ui';
import { SafetySheet, type SafetyTarget } from '@/components/safety-sheet';
import { useLocale } from '@/i18n/locale-provider';
import { useDashboard } from '@/state/dashboard';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { formatTime, toIsoDate } from '@/utils/dates';

const MAX_DRAFT = 1000;
const MAX_RECORDING_SEC = 300;
const TYPING_THROTTLE_MS = 1500;
/** Тап, а не затискання, не має випадково відправити порожню голосову. */
const MIN_HOLD_MS = 400;
const CANCEL_DRAG_PX = 60;
const RATES = [0.5, 1, 1.5, 2];
const hit = { top: 6, bottom: 6, left: 6, right: 6 };

type ContactInfo = { offeredByMe: boolean; mutual: boolean; usernames: string[] };

const errorText = (error: unknown, fallback: string) =>
  error instanceof TRPCClientError && error.message ? error.message : fallback;

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

/** Голосова бульбашка: `useAudioPlayer` — хук, тому кожен файл має свій компонент. */
function VoiceBubble({ body, mine }: { body: string; mine: boolean }) {
  const { t } = useLocale();
  const { audioUrl, durationSec } = parseVoice(body);
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);
  const label = status.playing ? t('chats.pauseVoice') : t('chats.playVoice');
  const [rate, setRate] = useState(1);

  /** Той самий цикл 0.5→1→1.5→2, що в `ConstellaDashboard.vue:752-761`. */
  const cycleRate = () => {
    const index = RATES.indexOf(rate);
    const next = RATES[(index + 1) % RATES.length] ?? 1;
    setRate(next);
    player.setPlaybackRate(next);
  };

  return (
    <View style={styles.voiceRow}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={() => (status.playing ? player.pause() : player.play())}
        style={({ pressed }) => [styles.voicePlay, mine && styles.voicePlayMine, pressed && styles.pressed]}
      >
        <Text style={styles.voicePlayText}>{status.playing ? '⏸' : '▶'}</Text>
      </Pressable>
      <View style={styles.voiceTrack}>
        <View style={styles.voiceTrackBack}>
          <View
            style={[
              styles.voiceTrackFill,
              { width: `${Math.min(100, (status.currentTime / (durationSec || 1)) * 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.voiceTime}>
          {formatDuration(status.playing || status.currentTime > 0 ? status.currentTime : durationSec)}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`${t('dashboard.playbackSpeed')}: ${rate}×`}
        accessibilityRole="button"
        onPress={cycleRate}
        style={({ pressed }) => [styles.voiceRate, pressed && styles.pressed]}
      >
        <Text style={styles.voiceRateText}>{`${rate}×`}</Text>
      </Pressable>
    </View>
  );
}

export default function ChatScreen() {
  const { t } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ matchId?: string }>();
  const matchId = params.matchId ?? '';
  const { me } = useSession();
  const { matches, loading, loadMatches } = useDashboard();

  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [issue, setIssue] = useState('');
  const [toast, setToast] = useState('');
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [safety, setSafety] = useState<SafetyTarget | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(0);
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [cancelling, setCancelling] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const list = useRef<ScrollViewInstance | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const seconds = useRef(0);
  const heldAt = useRef(0);
  const holdOrigin = useRef({ x: 0, y: 0 });
  const cancelRef = useRef(false);
  const holdingRef = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingAt = useRef(0);
  const typingHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<ChatSocketHandle | null>(null);

  const match = matches.find((entry) => entry.id === matchId) ?? null;
  const myId = me?.userId ?? '';

  /** Ліміт 12 повідомлень/хв (`social.ts:626`) — той самий переклад, що для WS-кадру. */
  const chatError = (error: unknown) =>
    error instanceof TRPCClientError && error.data?.code === 'TOO_MANY_REQUESTS'
      ? t('chats.rateLimited')
      : errorText(error, t('dashboard.loadError'));

  const flash = useCallback((value: string) => {
    setToast(value);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setToast(''), 3600);
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (typingHide.current) clearTimeout(typingHide.current);
    },
    [],
  );

  const loadThread = useCallback(async () => {
    if (!matchId) return;
    try {
      const result = await trpc.social.chatMessages.query({ matchId });
      setThread(result.messages as ChatMessage[]);
      setContact(result.contact as ContactInfo);
    } catch (error) {
      setIssue(chatError(error));
    }
  }, [matchId, t]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([loadThread(), loadMatches()]);
    }, [loadThread, loadMatches]),
  );

  const onFrame = useCallback(
    (frame: ChatFrame) => {
      if (frame.type === 'chat.message') {
        const incoming = frame.message;
        setThread((current) =>
          current.some((entry) => entry.id === incoming.id)
            ? current
            : [...current, incoming].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
              ),
        );
        if (incoming.senderId !== myId) {
          socketRef.current?.send({ type: 'send.read', messageId: incoming.id });
          void loadMatches();
        }
        return;
      }
      if (frame.type === 'chat.typing') {
        setPeerTyping(true);
        if (typingHide.current) clearTimeout(typingHide.current);
        typingHide.current = setTimeout(() => setPeerTyping(false), 3000);
        return;
      }
      if (frame.type === 'presence.read') {
        setThread((current) =>
          current.map((entry) => (entry.id === frame.messageId ? { ...entry, readAt: frame.readAt } : entry)),
        );
        return;
      }
      if (frame.type === 'error') {
        // Сервер відмовляє кадром із машинним кодом (index.ts:390-405): rate_limited
        // перекладаємо (як і веб `:623`), решта — тихо, як у вебі.
        setIssue(frame.code === 'rate_limited' ? t('chats.rateLimited') : frame.message || t('chats.badRoom'));
      }
    },
    // Через ref: шлем `send.read` із сокетом, не перепідписуючись на кожен ререндер.
    [loadMatches, myId],
  );

  const socket = useChatSocket(matchId || null, onFrame);
  socketRef.current = socket;

  useEffect(() => {
    list.current?.scrollToEnd({ animated: true });
  }, [thread.length, peerTyping]);

  const sendText = async () => {
    const body = draft.trim();
    if (!body || !matchId || sending) return;
    setSending(true);
    try {
      if (!socket.send({ type: 'send.message', body })) {
        // Фолбек вебу (`ConstellaDashboard.vue:349`): REST, коли сокет не відкритий.
        const message = await trpc.social.sendMessage.mutate({ matchId, body });
        setThread((current) =>
          current.some((entry) => entry.id === message.id)
            ? current
            : [...current, message as ChatMessage],
        );
      }
      setDraft('');
      setIssue('');
      void loadMatches();
    } catch (error) {
      setIssue(chatError(error));
    } finally {
      setSending(false);
    }
  };

  const onDraftChange = (value: string) => {
    setDraft(value.slice(0, MAX_DRAFT));
    const now = Date.now();
    if (socket.connected && now - typingAt.current > TYPING_THROTTLE_MS) {
      typingAt.current = now;
      socket.send({ type: 'send.typing' });
    }
  };

  const startRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    // Палець міг відпускатися, поки просили дозвіл, — тоді не стартуємо взагалі.
    if (!permission.granted || !holdingRef.current) {
      if (!permission.granted) setIssue(t('dashboard.voiceUnsupported'));
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      if (!holdingRef.current) return;
      recorder.record();
      seconds.current = 0;
      setRecorded(0);
      setRecording(true);
    } catch (error) {
      setIssue(errorText(error, t('dashboard.voiceUnsupported')));
    }
  };

  const stopRecording = async (keep: boolean) => {
    holdingRef.current = false;
    cancelRef.current = false;
    setCancelling(false);
    if (!recording && !recorder.isRecording) return;
    setRecording(false);
    const duration = Math.min(MAX_RECORDING_SEC, Math.max(1, seconds.current || 1));
    await recorder.stop();
    if (!keep || !matchId) return;
    const uri = recorder.uri;
    if (!uri) return;
    setSending(true);
    try {
      // HIGH_QUALITY пише .m4a → `audio/mp4`, є у дозволеному переліку photos.ts:50.
      const asset = await uploadVoice({ uri, mimeType: 'audio/mp4' });
      const message = await trpc.social.sendVoiceMessage.mutate({
        matchId,
        audioUrl: asset.publicUrl,
        durationSec: duration,
      });
      setThread((current) =>
        current.some((entry) => entry.id === message.id)
          ? current
          : [...current, message as ChatMessage],
      );
      void loadMatches();
    } catch (error) {
      setIssue(chatError(error));
    } finally {
      setSending(false);
    }
  };

  /** Затискання як у Telegram: натиснув — пише, відпустив — надіслав, потяг — скасував. */
  const beginHold = (event: GestureResponderEvent) => {
    if (sending || recording) return;
    holdOrigin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    heldAt.current = Date.now();
    cancelRef.current = false;
    holdingRef.current = true;
    setCancelling(false);
    void startRecording();
  };

  const moveHold = (event: GestureResponderEvent) => {
    if (!holdingRef.current) return;
    const up = holdOrigin.current.y - event.nativeEvent.pageY;
    const aside = Math.abs(event.nativeEvent.pageX - holdOrigin.current.x);
    const cancel = up > CANCEL_DRAG_PX || aside > CANCEL_DRAG_PX * 2;
    if (cancel !== cancelRef.current) {
      cancelRef.current = cancel;
      setCancelling(cancel);
    }
  };

  const endHold = () => {
    const tooShort = Date.now() - heldAt.current < MIN_HOLD_MS;
    void stopRecording(!cancelRef.current && !tooShort);
    if (tooShort) flash(t('dashboard.holdToRecord'));
  };

  /**
   * 📎 з веба: фото йдуть через `photos.createUpload` (тільки `image/*`), кружок —
   * через `photos.createVideoUpload`. Тіло повідомлення — той самий JSON, що й у веби,
   * щоб бульбашки читались з обох боків (`displayKind` у `api/types.ts`).
   */
  const attachMedia = async (source: 'gallery' | 'camera' | 'note') => {
    if (!matchId) return;
    setAttachOpen(false);
    try {
      setSending(true);
      if (source === 'note') {
        const picked = await pickVideoFromCamera();
        if (!picked) return;
        const asset = await uploadChatVideo(picked);
        const message = await trpc.social.sendMessage.mutate({
          matchId,
          body: JSON.stringify({
            kind: 'video',
            round: true,
            url: asset.publicUrl,
            fileName: asset.videoKey.split('/').pop() ?? 'note.mp4',
            size: asset.sizeBytes,
            durationSec: picked.durationSec,
          }),
        });
        setThread((current) =>
          current.some((entry) => entry.id === message.id) ? current : [...current, message as ChatMessage],
        );
      } else {
        const picked = source === 'camera' ? await pickFromCamera() : await pickFromGallery();
        if (!picked) return;
        const fileName = picked.uri.split('/').pop() || 'photo.jpg';
        const asset = await uploadChatImage(picked, fileName);
        const message = await trpc.social.sendMessage.mutate({
          matchId,
          body: JSON.stringify({ kind: 'image', url: asset.url, fileName: asset.fileName, size: asset.size }),
        });
        setThread((current) =>
          current.some((entry) => entry.id === message.id) ? current : [...current, message as ChatMessage],
        );
      }
      void loadMatches();
    } catch (error) {
      setIssue(error instanceof MediaError ? t(error.messageKey) : errorText(error, t('dashboard.loadError')));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!recording) return;
    const tick = setInterval(() => {
      seconds.current += 1;
      setRecorded(seconds.current);
      if (seconds.current >= MAX_RECORDING_SEC) void stopRecording(true);
    }, 1000);
    return () => clearInterval(tick);
    // stopRecording читає свіжі refs, а не стан, тому в залежності його не треба.
  }, [recording]);

  const shareTelegramContact = async () => {
    if (!matchId || sharing) return;
    setSharing(true);
    try {
      const result = await trpc.social.shareContact.mutate({ matchId });
      flash(result.mutual ? t('chats.contactOpen') : t('chats.contactSent'));
      await loadThread();
    } catch (error) {
      setIssue(chatError(error));
    } finally {
      setSharing(false);
    }
  };

  if (!matchId) return null;

  const peer = match?.profile ?? null;
  if (!match && !thread.length) {
    // Холодний вхід через deep link: список ще не долетів — не поспічаймо сказати
    // «чату немає», інакше перший кадр буде хибним.
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.shell}>
        <View style={styles.header}>
          <HeaderBack onPress={() => router.back()} />
        </View>
        <View style={styles.missing}>
          <Text style={styles.missingText}>{loading ? t('dashboard.loadingChats') : t('chats.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.shell}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <HeaderBack onPress={() => router.back()} />
          {peer?.photos[0] ? (
            <Image accessibilityLabel={t('dashboard.verifiedProfile')} contentFit="cover" source={{ uri: peer.photos[0] }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarMark}>✦</Text>
            </View>
          )}
          <View style={styles.headCopy}>
            <Text numberOfLines={1} style={styles.headName}>
              {peer?.displayName || t('dashboard.newMatch')}
            </Text>
            <Text numberOfLines={1} style={styles.headMeta}>
              {peer ? `${peer.age} ${t('dashboard.years')} · ${peer.city || t('dashboard.noCity')}` : ''}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={socket.connected ? t('dashboard.reconnected') : t('dashboard.connecting')}
            accessibilityRole="button"
            onPress={() => void loadThread()}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Text style={[styles.iconText, socket.connected ? styles.iconLive : styles.iconIdle]}>
              {socket.connected ? '●' : '○'}
            </Text>
          </Pressable>
          {peer ? (
            <Pressable
              accessibilityLabel={t('dashboard.report')}
              accessibilityRole="button"
              onPress={() => setSafety({ action: 'report', label: peer.displayName, profileId: peer.id, matchId })}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Text style={styles.iconText}>⚑</Text>
            </Pressable>
          ) : null}
        </View>

        {peer && contact && !contact.mutual ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(contact.offeredByMe || sharing) }}
            disabled={contact.offeredByMe || sharing}
            onPress={() => void shareTelegramContact()}
            style={({ pressed }) => [styles.contactBar, pressed && styles.pressed, (contact.offeredByMe || sharing) && styles.contactDisabled]}
          >
            <Text style={styles.contactText}>
              {contact.offeredByMe ? `✓ ${t('chats.contactOffered')}` : `✈ ${t('dashboard.shareTelegram')}`}
            </Text>
          </Pressable>
        ) : null}
        {contact?.mutual ? (
          <View style={styles.contactBar}>
            <Text style={styles.contactText}>✈ {contact.usernames.map((name) => `@${name}`).join(', ')}</Text>
          </View>
        ) : null}

        <ScrollView
          accessibilityLiveRegion="polite"
          contentContainerStyle={styles.listContent}
          ref={list}
          style={styles.list}
        >
          <Text style={styles.dayDivider}>
            {t('dashboard.chatDate')} · {toIsoDate(match?.createdAt ?? thread[0]?.createdAt ?? null)}
          </Text>
          {thread.map((message) => {
            const mine = message.senderId === myId;
            const shown = displayKind(message);
            const media = shown === 'image' || shown === 'video' ? mediaFromBody(message.body) : null;
            return (
              <View key={message.id} style={[styles.messageRow, mine && styles.messageRowMine]}>
                {shown === 'voice' ? (
                  <VoiceBubble body={message.body} mine={mine} />
                ) : shown === 'image' && media ? (
                  <Image
                    accessibilityLabel={t('chats.lastImage')}
                    contentFit="cover"
                    source={{ uri: media.url }}
                    style={styles.media}
                  />
                ) : shown === 'video' && media ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={hit}
                    onPress={() => void Linking.openURL(media.url)}
                    style={({ pressed }) => [
                      media.round ? styles.note : styles.bubble,
                      media.round && mine && styles.noteMine,
                      !media.round && styles.system,
                      pressed && styles.pressed,
                    ]}
                  >
                    {media.round ? (
                      <>
                        <Text style={styles.noteMark}>▶</Text>
                        {media.durationSec ? <Text style={styles.noteTime}>{formatDuration(media.durationSec)}</Text> : null}
                      </>
                    ) : (
                      <Text style={styles.systemText}>
                        {t('dashboard.videoMessage')} · {t('chats.openVideo')}
                      </Text>
                    )}
                  </Pressable>
                ) : shown === 'call' ? (
                  <Text style={styles.systemText}>
                    📞 {message.body.includes('video') ? t('dashboard.videoCall') : t('dashboard.audioCall')}
                  </Text>
                ) : shown === 'contact' ? (
                  <Text style={styles.systemText}>✈ {message.body}</Text>
                ) : (
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubblePeer]}>
                    <Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.body}</Text>
                  </View>
                )}
                <Text style={styles.messageMeta}>
                  {formatTime(message.createdAt)}
                  {mine ? ` · ${message.readAt ? t('dashboard.messageRead') : message.deliveredAt ? t('dashboard.messageSent') : ''}` : ''}
                </Text>
              </View>
            );
          })}
          {peerTyping ? <Text style={styles.typing}>{t('dashboard.typing')}</Text> : null}
          {!thread.length ? <Text style={styles.chatStart}>{t('dashboard.chatStart')}</Text> : null}
        </ScrollView>

        {issue ? (
          <View style={styles.noticeWrap}>
            <Notice kind="error">{issue}</Notice>
          </View>
        ) : null}
        {toast ? (
          <View style={styles.noticeWrap}>
            <Notice kind="status">{toast}</Notice>
          </View>
        ) : null}
        {socket.note ? (
          <View style={styles.noticeWrap}>
            <Notice kind="status">{socket.note}</Notice>
          </View>
        ) : null}

        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.composerRow}>
            <Pressable
              accessibilityLabel={t('dashboard.attachMedia')}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(sending), selected: attachOpen }}
              disabled={sending}
              hitSlop={hit}
              onPress={() => setAttachOpen(true)}
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            >
              <Text style={styles.iconText}>📎</Text>
            </Pressable>

            {mode === 'voice' ? (
              <View
                accessibilityLabel={t('dashboard.holdToRecord')}
                accessibilityRole="button"
                hitSlop={hit}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={beginHold}
                onResponderMove={moveHold}
                onResponderRelease={endHold}
                onResponderTerminationRequest={() => false}
                onStartShouldSetResponder={() => !sending}
                style={[styles.holdBar, recording && styles.holdBarLive, cancelling && styles.holdBarCancel]}
              >
                {recording ? <Text style={styles.recordingDot}>●</Text> : null}
                <Text numberOfLines={1} style={styles.holdText}>
                  {recording
                    ? `${cancelling ? t('dashboard.slideToCancel') : t('dashboard.releaseToSend')} · ${formatDuration(recorded)}`
                    : t('dashboard.holdToRecord')}
                </Text>
              </View>
            ) : (
              <TextInput
                accessibilityLabel={t('dashboard.messagePlaceholder')}
                multiline
                onChangeText={onDraftChange}
                placeholder={t('dashboard.messagePlaceholder')}
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={draft}
              />
            )}

            <Pressable
              accessibilityLabel={mode === 'voice' ? t('dashboard.textMode') : t('dashboard.recordVoice')}
              accessibilityRole="button"
              hitSlop={hit}
              onPress={() => {
                if (recording) void stopRecording(false);
                setMode((current) => (current === 'voice' ? 'text' : 'voice'));
              }}
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            >
              <Text style={styles.iconText}>{mode === 'voice' ? '⌨' : '🎙'}</Text>
            </Pressable>

            {mode === 'text' && draft.trim() ? (
              <Pressable
                accessibilityLabel={t('dashboard.send')}
                accessibilityRole="button"
                accessibilityState={{ disabled: Boolean(sending) }}
                disabled={sending}
                hitSlop={hit}
                onPress={() => void sendText()}
                style={({ pressed }) => [styles.roundButton, styles.sendButton, pressed && styles.pressed, sending && styles.sendDisabled]}
              >
                <Text style={styles.sendText}>{sending ? '…' : '➤'}</Text>
              </Pressable>
            ) : null}
          </View>

          <Modal transparent visible={attachOpen} onRequestClose={() => setAttachOpen(false)}>
            <Pressable
              accessibilityLabel={t('dashboard.cancel')}
              onPress={() => setAttachOpen(false)}
              style={styles.sheetBackdrop}
            >
              <View
                onStartShouldSetResponder={() => true}
                style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
              >
                <Text style={styles.sheetTitle}>{t('dashboard.attachMedia')}</Text>
                {(
                  [
                    { key: 'gallery', icon: '🖼', label: t('photos.gallery') },
                    { key: 'camera', icon: '📷', label: t('photos.camera') },
                    { key: 'note', icon: '⭕', label: t('dashboard.videoNote') },
                  ] as const
                ).map((option) => (
                  <Pressable
                    key={option.key}
                    accessibilityRole="button"
                    onPress={() => void attachMedia(option.key)}
                    style={({ pressed }) => [styles.sheetOption, pressed && styles.pressed]}
                  >
                    <Text style={styles.sheetIcon}>{option.icon}</Text>
                    <Text style={styles.sheetOptionText}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Modal>

          <Text style={styles.footnote}>{socket.connected ? t('dashboard.reconnected') : t('dashboard.chatPolling')}</Text>
        </View>
      </KeyboardAvoidingView>

      <SafetySheet
        onClose={() => setSafety(null)}
        onSuccess={(action) => {
          flash(t(action === 'block' ? 'dashboard.blocked' : 'dashboard.reportThanks'));
          if (action === 'block') router.back();
        }}
        target={safety}
      />
    </SafeAreaView>
  );
}

function HeaderBack({ onPress }: { onPress: () => void }) {
  const { t } = useLocale();
  return (
    <Pressable
      accessibilityLabel={t('dashboard.allChats')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <Text style={styles.backText}>←</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shell: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 22 },
  avatar: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.bgDeep },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgDeep,
  },
  avatarMark: { color: colors.goldDim, fontSize: 16 },
  headCopy: { flex: 1, gap: 1 },
  headName: { ...typography.title, color: colors.text, fontSize: 16 },
  headMeta: { ...typography.caption, color: colors.mutedSoft },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.textSoft, fontSize: 16 },
  iconLive: { color: colors.mint },
  iconIdle: { color: colors.muted },
  contactBar: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.mint,
    backgroundColor: colors.mintDim,
  },
  contactDisabled: { opacity: 0.6 },
  contactText: { ...typography.caption, color: colors.text, fontSize: 12 },
  list: { flex: 1 },
  listContent: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'flex-end' },
  dayDivider: { ...typography.caption, color: colors.goldDim, textAlign: 'center' },
  messageRow: { gap: 4, maxWidth: '86%' },
  messageRowMine: { alignSelf: 'flex-end' },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubblePeer: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sm },
  bubbleMine: { backgroundColor: colors.mintDim, borderTopRightRadius: radius.sm },
  messageText: { ...typography.body, color: colors.text },
  messageTextMine: { color: colors.text },
  messageMeta: { ...typography.caption, color: colors.muted, fontSize: 10 },
  media: { width: 220, height: 220, borderRadius: radius.md, backgroundColor: colors.bgDeep },
  note: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: colors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteMine: { borderColor: colors.mint },
  noteMark: { color: colors.text, fontSize: 22 },
  noteTime: { ...typography.caption, color: colors.mutedSoft, position: 'absolute', bottom: 12 },
  system: { alignSelf: 'flex-start' },
  systemText: { ...typography.caption, color: colors.mutedSoft, fontSize: 12 },
  typing: { ...typography.caption, color: colors.mintSoft },
  chatStart: { ...typography.body, color: colors.mutedSoft, textAlign: 'center', marginTop: spacing.xl },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  voicePlay: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.mint,
  },
  voicePlayMine: { backgroundColor: colors.mintDim },
  voicePlayText: { color: colors.text, fontSize: 14 },
  voiceTrack: { flex: 1, gap: 2 },
  voiceTrackBack: { height: 4, borderRadius: radius.pill, backgroundColor: colors.border },
  voiceTrackFill: { height: 4, borderRadius: radius.pill, backgroundColor: colors.gold },
  voiceTime: { ...typography.caption, color: colors.muted, fontSize: 10 },
  voiceRate: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  voiceRateText: { ...typography.caption, color: colors.mutedSoft, fontSize: 11 },
  noticeWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  composer: { paddingHorizontal: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    maxHeight: 96,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    backgroundColor: colors.bgDeep,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sendButton: { backgroundColor: colors.goldDeep, borderColor: colors.goldDeep },
  sendDisabled: { opacity: 0.55 },
  sendText: { color: colors.surfaceRaised, fontSize: 18, fontWeight: '700' },
  holdBar: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgDeep,
    paddingHorizontal: spacing.md,
  },
  holdBarLive: { borderColor: colors.mint, backgroundColor: colors.mintDim },
  holdBarCancel: { borderColor: colors.dangerSoft },
  holdText: { ...typography.body, color: colors.textSoft, fontSize: 13, flexShrink: 1 },
  recordingDot: { color: colors.dangerSoft, fontSize: 12 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#050b0bcc' },
  sheet: {
    marginHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  sheetTitle: { ...typography.caption, color: colors.muted, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  sheetOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  sheetIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  sheetOptionText: { ...typography.body, color: colors.text },
  footnote: { ...typography.caption, color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },
  pressed: { opacity: 0.8 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  missingText: { ...typography.body, color: colors.mutedSoft, textAlign: 'center' },
});
