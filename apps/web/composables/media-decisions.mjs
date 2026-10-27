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

// Mirror of apps/api/src/routers/photos.ts image `z.enum`.
export const IMAGE_ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

// A camera capture reaches the input as `…/IMG_1234.jpg` with an empty `type` on some
// Android WebViews, so the extension is then the only reliable hint at the real codec.
// `.mov`/`.m4v` are MPEG-4 containers, so declaring them `video/mp4` matches the bytes.
const EXTENSION_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', webm: 'video/webm',
};

const typeByExtension = (name) => {
  const ext = (name || '').toLowerCase().split('.').pop() || '';
  return Object.hasOwn(EXTENSION_TYPES, ext) ? EXTENSION_TYPES[ext] : '';
};

/**
 * Chat attachments have to land inside the upload allowlist, or the `z.enum` of
 * `photos.createUpload`/`createVideoUpload` rejects them before a byte is uploaded.
 * Returns the kind plus the single `Content-Type` to sign the PUT with, or `null` for a
 * file no path accepts (a `.heic` from the iPhone camera roll, an unknown container).
 */
export function mediaKindOf({ type, name }) {
  const mime = normalizeMime(type).toLowerCase();
  const candidate = IMAGE_ALLOWED.includes(mime) || VIDEO_ALLOWED.includes(mime) ? mime : typeByExtension(name);
  if (!candidate) return null;
  return { kind: candidate.startsWith('video/') ? 'video' : 'image', contentType: candidate };
}

/**
 * Telegram's WebView grants media access per `onPermissionRequest`, i.e. once per
 * `getUserMedia` call, and does not persist it for the origin. A regular browser remembers
 * "Allow", so only there is it worth keeping one microphone stream warm per chat room.
 * UA markers: `telegram/android-…`, `telegram/ios-…`, `TelegramAndroid` in Mini Apps.
 */
export const isTelegramWebview = (userAgent) => /telegram/i.test(userAgent || '');

/**
 * `capture="environment"` is non-standard: WebKit ignores it, Android WebViews often answer
 * with a gallery+camera chooser, and a desktop has no rear camera at all. The in-app camera
 * therefore needs `getUserMedia`, which itself needs a secure context — everywhere else the
 * attribute stays as the fallback.
 */
export const isCameraCaptureSupported = ({ secureContext, hasGetUserMedia }) =>
  Boolean(secureContext && hasGetUserMedia);

/**
 * Centre square crop of a live frame, downscaled so neither edge exceeds `maxSide`. Even
 * output edges keep `drawImage` off half-pixel resampling; a stream that has not reported
 * its size yet yields `null` so the caller can skip the shot instead of baking NaN.
 */
export function shotRect({ videoWidth, videoHeight, maxSide = 1080 }) {
  const side = Math.min(videoWidth || 0, videoHeight || 0);
  if (side <= 0) return null;
  const out = Math.max(2, Math.floor(Math.min(side, maxSide) / 2) * 2);
  return {
    sx: Math.round((videoWidth - side) / 2),
    sy: Math.round((videoHeight - side) / 2),
    sw: side,
    sh: side,
    out,
  };
}
