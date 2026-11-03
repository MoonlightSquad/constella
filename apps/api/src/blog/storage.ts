import { randomUUID } from 'node:crypto';
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { bucket, getClient, isPhotoStorageConfigured } from '../photos/storage.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const extensions = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

/** Тимчасовий префікс спільний для обкладинок і аватарів: підпис і confirm в них однакові. */
const STAGING_PREFIX = 'blog/uploads';

type ImageSpec = {
  width: number;
  height: number;
  /** Кінцевий префікс: по ньому видалення відрізняє обкладинку від аватара. */
  prefix: string;
  position: 'centre' | 'attention';
};

/** Open Graph and the article header both want 1.91:1, so covers are normalised to it. */
const COVER: ImageSpec = { width: 1200, height: 630, prefix: 'blog/covers', position: 'centre' };
// Аватар — квадрат, і центр уваги замість геометричного центру: портрети кадрують не по
// середині, а `centre` відрізав би обличчя.
const AVATAR: ImageSpec = { width: 512, height: 512, prefix: 'blog/avatars', position: 'attention' };

export const isBlogCoverStorageConfigured = isPhotoStorageConfigured;

export type BlogImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

const createUpload = async (actorUserId: string, contentType: BlogImageContentType) => {
  const extension = extensions.get(contentType);
  if (!extension) throw new Error('Only JPEG, PNG, or WebP images are accepted.');
  const objectKey = `${STAGING_PREFIX}/${actorUserId}/${randomUUID()}.${extension}`;
  const uploadUrl = await getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: objectKey,
      ContentType: contentType,
      CacheControl: 'private, no-store',
    }),
    { expiresIn: 600 },
  );
  return { objectKey, uploadUrl, expiresInSeconds: 600, maxBytes: MAX_UPLOAD_BYTES, contentType };
};

/**
 * Нормалізує завантажений файл і прибирає оригінал. Префікс входить у відповідь, тому що
 * адмінінський confirm валідує staging-ключ за тим самим шаблоном, що й обкладинки.
 */
const processUpload = async (actorUserId: string, objectKey: string, contentType: string, spec: ImageSpec) => {
  const extension = extensions.get(contentType);
  if (!extension || !objectKey.startsWith(`${STAGING_PREFIX}/${actorUserId}/`) || objectKey.includes('..')) {
    throw new Error('Invalid or unauthorized upload object.');
  }
  const client = getClient();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: objectKey }));
  if (!head.ContentLength || head.ContentLength > MAX_UPLOAD_BYTES || head.ContentLength < 1) {
    throw new Error('Image must be between 1 byte and 10 MB.');
  }
  if (head.ContentType !== contentType) throw new Error('Uploaded content type does not match the signed request.');

  const response = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: objectKey }));
  if (!response.Body) throw new Error('Uploaded image could not be read.');
  const original = Buffer.from(await response.Body.transformToByteArray());

  const output = await sharp(original, { limitInputPixels: 30_000_000, failOn: 'error' })
    .rotate()
    .resize({ width: spec.width, height: spec.height, fit: 'cover', position: spec.position })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  const finalKey = `${spec.prefix}/${randomUUID()}.webp`;
  await client.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: finalKey,
    Body: output,
    ContentType: 'image/webp',
    ContentLength: output.length,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  await client.send(new DeleteObjectsCommand({
    Bucket: bucket(),
    Delete: { Objects: [{ Key: objectKey }], Quiet: true },
  }));

  const baseUrl = process.env.S3_PUBLIC_BASE_URL!.replace(/\/$/, '');
  return {
    finalKey,
    publicUrl: `${baseUrl}/${finalKey.split('/').map(encodeURIComponent).join('/')}`,
    width: spec.width,
    height: spec.height,
    sizeBytes: output.length,
  };
};

export const createCoverUpload = (actorUserId: string, contentType: BlogImageContentType) => createUpload(actorUserId, contentType);

export const processCoverUpload = async (actorUserId: string, objectKey: string, contentType: string) => {
  const { finalKey, ...rest } = await processUpload(actorUserId, objectKey, contentType, COVER);
  return { coverKey: finalKey, ...rest };
};

export const createAvatarUpload = (actorUserId: string, contentType: BlogImageContentType) => createUpload(actorUserId, contentType);

export const processAvatarUpload = async (actorUserId: string, objectKey: string, contentType: string) => {
  const { finalKey, ...rest } = await processUpload(actorUserId, objectKey, contentType, AVATAR);
  return { avatarKey: finalKey, ...rest };
};

/** Best effort: an orphaned object costs storage, a failed post deletion costs content. */
const removeObjects = async (keys: string[], prefix: string) => {
  const uniqueKeys = [...new Set(keys.filter((key) => key.startsWith(prefix)))];
  if (!uniqueKeys.length) return;
  try {
    await getClient().send(new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: uniqueKeys.map((Key) => ({ Key })), Quiet: true },
    }));
  } catch {
    // The row is already gone; the object is cleaned up by the bucket lifecycle.
  }
};

export const removeCoverObjects = (keys: string[]) => removeObjects(keys, 'blog/covers/');

/** Ключ аватара — не ключ обкладинки: без другого експорту видалення автора лишило б файл у бакеті. */
export const removeAvatarObjects = (keys: string[]) => removeObjects(keys, 'blog/avatars/');

/** `blog/avatars/<uuid>.webp` з публічного URL: рядки бази тримають повне посилання. */
export const avatarKeyFromUrl = (url: string | null) => {
  if (!url) return null;
  try {
    const path = new URL(url).pathname.replace(/^\//, '');
    return path.startsWith('blog/avatars/') ? path : null;
  } catch {
    return null;
  }
};
