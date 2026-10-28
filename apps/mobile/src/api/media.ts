import * as ImagePicker from 'expo-image-picker';
import { File, UploadType } from 'expo-file-system';
import type { PermissionResponse } from 'expo';

import { trpc } from './trpc';
import type { TranslationKey } from '@/i18n/messages';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export const VOICE_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'] as const;
export type VoiceType = (typeof VOICE_TYPES)[number];

export const VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];

export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
export const MAX_PHOTOS = 6;

export class MediaError extends Error {
  constructor(readonly messageKey: TranslationKey) {
    super(messageKey);
    this.name = 'MediaError';
  }
}

export type PickedImage = { uri: string; mimeType: string; size: number };

export const isPhotoType = (value: string | null | undefined): value is PhotoType =>
  (PHOTO_TYPES as readonly string[]).includes(value ?? '');

export const isVoiceType = (value: string | null | undefined): value is VoiceType =>
  (VOICE_TYPES as readonly string[]).includes(value ?? '');

export const isVideoType = (value: string | null | undefined): value is VideoType =>
  (VIDEO_TYPES as readonly string[]).includes(value ?? '');

/**
 * Дозвіл питаємо саме під вибране джерело: `requestMediaLibraryPermissionsAsync` нічого не
 * дає для камери, а iOS без camera-grant тихо відкриває галерею замість об'єктива.
 */
const pick = async (
  requestPermission: () => Promise<PermissionResponse>,
  launch: () => Promise<ImagePicker.ImagePickerResult>,
): Promise<PickedImage | null> => {
  const permission = await requestPermission();
  if (!permission.granted) throw new MediaError('photos.permission');

  const result = await launch();
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  if (!isPhotoType(mimeType)) throw new MediaError('photos.badType');
  const size = asset.fileSize ?? 0;
  if (size > MAX_ASSET_BYTES) throw new MediaError('photos.tooBig');

  return { uri: asset.uri, mimeType, size };
}

export const pickFromGallery = () =>
  pick(
    () => ImagePicker.requestMediaLibraryPermissionsAsync(),
    () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: false }),
  );

export const pickFromCamera = () =>
  pick(
    () => ImagePicker.requestCameraPermissionsAsync(),
    () => ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 }),
  );

export type PickedVideo = { uri: string; mimeType: string; size: number; durationSec: number };

/**
 * Кружок з системної камери: `expo-image-picker` не дає власного UI затискання, тому
 * тримаєш кнопку запису вже в системній камері. `expo-camera` знадобився б для
 * вбудованого прев'ю, але це новий рідний модуль і перезбірка застосунку.
 */
export const pickVideoFromCamera = async (): Promise<PickedVideo | null> => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new MediaError('photos.permission');

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const mimeType = asset.mimeType ?? 'video/mp4';
  if (!isVideoType(mimeType)) throw new MediaError('photos.badType');
  const size = asset.fileSize ?? 0;
  if (size > MAX_VIDEO_BYTES) throw new MediaError('photos.tooBig');

  return { uri: asset.uri, mimeType, size, durationSec: Math.round(asset.duration ?? 0) };
};

/**
 * Presigned PUT: `confirmUpload` порівнює `head.ContentType` з тим самим значенням,
 * тому заголовок і `mimeType` мусить збігатися з `createUpload` (photos/storage.ts:128).
 */
async function putToStorage(fileUri: string, uploadUrl: string, contentType: string) {
  const response = await new File(fileUri).upload(uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'Content-Type': contentType },
    mimeType: contentType,
  });
  if (response.status < 200 || response.status >= 300) throw new MediaError('photos.uploadFailed');
}

export type PhotoAsset = Awaited<ReturnType<typeof trpc.photos.mine.query>>[number];

/** Виклик мусить потім оновити `listPhotos()` — як це робить `PhotoUploader.vue:27`. */
export async function uploadPhoto(image: PickedImage): Promise<void> {
  if (!isPhotoType(image.mimeType)) throw new MediaError('photos.badType');
  const target = await trpc.photos.createUpload.mutate({ contentType: image.mimeType });
  await putToStorage(image.uri, target.uploadUrl, image.mimeType);
  const asset = await trpc.photos.confirmUpload.mutate({ objectKey: target.objectKey, contentType: image.mimeType });
  if (asset.status === 'rejected') throw new MediaError('photos.rejectedContent');
}

/**
 * Фото в чат. Тіло повідомлення — той самий JSON, що й у вебі
 * (`ConstellaDashboard.vue:778`), щоб бульбашки читались з обох боків.
 * Обережно: `photos.confirmUpload` одночасно додає URL до `users.photos` і в
 * ліміт 6 активних фото — точно як на вебі, серверного «chat-only» шляху немає.
 */
export async function uploadChatImage(
  image: PickedImage,
  fileName: string,
): Promise<{ url: string; fileName: string; size: number }> {
  if (!isPhotoType(image.mimeType)) throw new MediaError('photos.badType');
  const target = await trpc.photos.createUpload.mutate({ contentType: image.mimeType });
  await putToStorage(image.uri, target.uploadUrl, image.mimeType);
  const asset = await trpc.photos.confirmUpload.mutate({ objectKey: target.objectKey, contentType: image.mimeType });
  // Відхилене модерацією фото вже видалене зі сховища: кидаємо до `sendMessage`,
  // щоб екран не показав бульбашку на битий URL.
  if (asset.status === 'rejected') throw new MediaError('photos.rejectedContent');
  return { url: asset.publicUrl, fileName, size: image.size };
}

export const listPhotos = () => trpc.photos.mine.query();

export const removePhoto = (id: string) => trpc.photos.remove.mutate({ id });

export type VoiceAsset = Awaited<ReturnType<typeof trpc.photos.confirmVoiceUpload.mutate>>;
export async function uploadVoice(voice: { uri: string; mimeType: string }): Promise<VoiceAsset> {
  if (!isVoiceType(voice.mimeType)) throw new MediaError('dashboard.voiceUnsupported');
  const target = await trpc.photos.createVoiceUpload.mutate({ contentType: voice.mimeType });
  await putToStorage(voice.uri, target.uploadUrl, voice.mimeType);
  return trpc.photos.confirmVoiceUpload.mutate({ objectKey: target.objectKey, contentType: voice.mimeType });
}

export type VideoAsset = Awaited<ReturnType<typeof trpc.photos.confirmVideoUpload.mutate>>;

/** Відео на R2 через `photos.createVideoUpload` — єдиний шлях, що приймає `video/*`. */
export async function uploadChatVideo(video: PickedVideo): Promise<VideoAsset> {
  if (!isVideoType(video.mimeType)) throw new MediaError('photos.badType');
  const target = await trpc.photos.createVideoUpload.mutate({ contentType: video.mimeType });
  await putToStorage(video.uri, target.uploadUrl, video.mimeType);
  return trpc.photos.confirmVideoUpload.mutate({ objectKey: target.objectKey, contentType: video.mimeType });
}
