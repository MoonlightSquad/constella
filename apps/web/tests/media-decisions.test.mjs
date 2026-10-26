import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideCancel,
  decideHoldAction,
  isTelegramWebview,
  isVideoUploadable,
  isVoiceUploadable,
  normalizeMime,
  pickAudioMime,
  pickVideoMime,
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
