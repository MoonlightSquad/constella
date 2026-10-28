import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideCancel,
  decideHoldAction,
  isCameraCaptureSupported,
  isTelegramWebview,
  isVideoUploadable,
  isVoiceUploadable,
  mediaKindOf,
  normalizeMime,
  pickAudioMime,
  pickVideoMime,
  shotRect,
} from '../composables/media-decisions.mjs';

const webkit = (type) => type.startsWith('audio/mp4') || type === 'video/mp4';
const blink = (type) => type.startsWith('audio/webm') || type.startsWith('video/webm');

test('iOS WebKit records mp4, which the upload allowlist accepts', () => {
  const audio = pickAudioMime(webkit);
  assert.equal(audio, 'audio/mp4');
  assert.equal(isVoiceUploadable(audio), true);
  assert.equal(pickVideoMime(webkit), 'video/mp4');
  assert.equal(isVideoUploadable(pickVideoMime(webkit)), true);
});

test('Blink prefers webm/opus and the codec suffix is stripped for the API', () => {
  const audio = pickAudioMime(blink);
  assert.equal(audio, 'audio/webm;codecs=opus');
  assert.equal(normalizeMime(audio), 'audio/webm');
  assert.equal(isVoiceUploadable(normalizeMime(audio)), true);
});

test('an unsupported engine yields an empty pick so the caller retries without a mimeType', () => {
  assert.equal(pickAudioMime(() => false), '');
  assert.equal(pickVideoMime(() => false), '');
  assert.equal(isVoiceUploadable('audio/x-weird'), false);
});

test('a tap consumed by the permission dialog neither sends nor cycles mode', () => {
  assert.equal(decideHoldAction({ elapsedMs: 100, awaitingPermission: true, cancelling: false, minMs: 400 }), 'dismiss');
  assert.equal(decideHoldAction({ elapsedMs: 5_000, awaitingPermission: true, cancelling: false, minMs: 400 }), 'dismiss');
  assert.equal(decideHoldAction({ elapsedMs: 100, awaitingPermission: false, cancelling: false, minMs: 400 }), 'tooShort');
});

test('a real hold sends, a slide-up cancels', () => {
  assert.equal(decideHoldAction({ elapsedMs: 2_000, awaitingPermission: false, cancelling: false, minMs: 400 }), 'send');
  assert.equal(decideHoldAction({ elapsedMs: 2_000, awaitingPermission: false, cancelling: true, minMs: 400 }), 'cancel');
  assert.equal(normalizeMime(''), '');
});

test('swiping left cancels sooner than swiping right', () => {
  assert.equal(decideCancel({ dx: -70, dy: 0 }), true);
  assert.equal(decideCancel({ dx: 70, dy: 0 }), false);
  assert.equal(decideCancel({ dx: 130, dy: 0 }), true);
  assert.equal(decideCancel({ dx: 0, dy: -70 }), true);
  assert.equal(decideCancel({ dx: 10, dy: -10 }), false);
});

test('only the Telegram WebView needs a warm microphone', () => {
  assert.equal(isTelegramWebview('Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Telegram/Android-11.5.3'), true);
  assert.equal(isTelegramWebview('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A Telegram/ios-11.5'), true);
  assert.equal(isTelegramWebview('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), false);
  assert.equal(isTelegramWebview(undefined), false);
});

test('a chat attachment is typed by mime first, extension only as a fallback', () => {
  assert.deepEqual(mediaKindOf({ type: 'image/heic', name: 'IMG_1.JPG' }), { kind: 'image', contentType: 'image/jpeg' });
  assert.deepEqual(mediaKindOf({ type: 'video/quicktime;codecs=hvc1', name: 'clip.mov' }), { kind: 'video', contentType: 'video/mp4' });
});

test('a camera file with an empty type still uploads by extension', () => {
  assert.deepEqual(mediaKindOf({ type: '', name: 'IMG_2024.jpg' }), { kind: 'image', contentType: 'image/jpeg' });
  assert.deepEqual(mediaKindOf({ type: undefined, name: 'VID_0001.mp4' }), { kind: 'video', contentType: 'video/mp4' });
});

test('nothing outside the upload allowlist is accepted', () => {
  assert.equal(mediaKindOf({ type: 'image/heic', name: 'IMG_1.HEIC' }), null);
  assert.equal(mediaKindOf({ type: '', name: 'photo.txt' }), null);
  assert.equal(mediaKindOf({ type: '', name: 'noextension' }), null);
  assert.equal(mediaKindOf({ type: 'application/pdf', name: 'resume.pdf' }), null);
  // Prototype keys must not resolve through the extension table.
  assert.equal(mediaKindOf({ type: '', name: 'a.constructor' }), null);
});

test('the in-app camera needs both a secure context and the API', () => {
  assert.equal(isCameraCaptureSupported({ secureContext: true, hasGetUserMedia: true }), true);
  assert.equal(isCameraCaptureSupported({ secureContext: false, hasGetUserMedia: true }), false);
  assert.equal(isCameraCaptureSupported({ secureContext: true, hasGetUserMedia: false }), false);
  assert.equal(isCameraCaptureSupported({}), false);
});

test('a landscape stream is cropped to the centred square', () => {
  assert.deepEqual(shotRect({ videoWidth: 1920, videoHeight: 1080 }), { sx: 420, sy: 0, sw: 1080, sh: 1080, out: 1080 });
});

test('a portrait stream keeps the full width and shifts down instead', () => {
  assert.deepEqual(shotRect({ videoWidth: 480, videoHeight: 640 }), { sx: 0, sy: 80, sw: 480, sh: 480, out: 480 });
});

test('maxSide caps the shot and always yields even edges', () => {
  assert.equal(shotRect({ videoWidth: 1920, videoHeight: 1080, maxSide: 720 }).out, 720);
  // An odd cap is rounded down, and a cap above the source never upscales.
  assert.equal(shotRect({ videoWidth: 1920, videoHeight: 1080, maxSide: 501 }).out, 500);
  assert.equal(shotRect({ videoWidth: 640, videoHeight: 480, maxSide: 1080 }).out, 480);
  // An odd source edge is rounded down, never up past the crop.
  const odd = shotRect({ videoWidth: 640, videoHeight: 481 });
  assert.equal(odd.out, 480);
  assert.equal(odd.out % 2, 0);
});

test('a stream that has not reported its size gives no rect rather than NaN', () => {
  assert.equal(shotRect({ videoWidth: 0, videoHeight: 1080 }), null);
  assert.equal(shotRect({ videoWidth: 1920 }), null);
  assert.equal(shotRect({}), null);
});
