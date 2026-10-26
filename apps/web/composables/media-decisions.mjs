// Order matters: Blink matches a webm variant first, WebKit rejects webm and lands on
// mp4 — the only type iOS MediaRecorder produces. Anything outside these lists must
// also exist in the upload allowlist (`photos.createVoiceUpload`/`createVideoUpload`),
// otherwise the tRPC `z.enum` rejects the upload and we fall back to a base64 body.
const AUDIO_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus', 'audio/ogg'];
const VIDEO_CANDIDATES = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];

// Mirror of apps/api/src/routers/photos.ts voice/video `z.enum` inputs.
export const VOICE_ALLOWED = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'];
export const VIDEO_ALLOWED = ['video/mp4', 'video/webm'];

/** Запам'ятовує результат стартового запиту дозволу: 'granted' | 'denied'. */
export const CONSENT_STORAGE_KEY = 'constella-media';

/** `MediaRecorder.mimeType` carries codecs (`audio/webm;codecs=opus`); the API wants the bare type. */
export const normalizeMime = (mimeType) => (mimeType || '').split(';')[0];

export const pickAudioMime = (isSupported) => AUDIO_CANDIDATES.find((type) => isSupported(type)) || '';
export const pickVideoMime = (isSupported) => VIDEO_CANDIDATES.find((type) => isSupported(type)) || '';
export const isVoiceUploadable = (mimeType) => VOICE_ALLOWED.includes(normalizeMime(mimeType));
export const isVideoUploadable = (mimeType) => VIDEO_ALLOWED.includes(normalizeMime(mimeType));

/**
 * The OS permission dialog steals the pointer stream, so a release that lands while we
 * are still awaiting `getUserMedia` is not a short tap: it must neither send anything
 * nor cycle voice↔note, or the first tap ever just flips the button.
 */
export function decideHoldAction({ elapsedMs, awaitingPermission, cancelling, minMs }) {
  if (awaitingPermission) return 'dismiss';
  if (cancelling) return 'cancel';
  if (elapsedMs < minMs) return 'tooShort';
  return 'send';
}

export const CANCEL_GESTURE_PX = { up: 60, left: 60, aside: 120 };

/**
 * Left is the cheap gesture (60 px), right stays at the old wide `aside` threshold so an
 * accidental drift does not throw away a take the user meant to send.
 * `dx`/`dy` are deltas from the press point: positive dx = finger moved right.
 */
export function decideCancel({ dx, dy, thresholds = CANCEL_GESTURE_PX }) {
  return -dy > thresholds.up || -dx > thresholds.left || Math.abs(dx) > thresholds.aside;
}
