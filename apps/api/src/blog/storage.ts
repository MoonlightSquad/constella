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

/** Open Graph and the article header both want 1.91:1, so covers are normalised to it. */
const COVER_WIDTH = 1200;
const COVER_HEIGHT = 630;

export const isBlogCoverStorageConfigured = isPhotoStorageConfigured;

export const createCoverUpload = async (actorUserId: string, contentType: 'image/jpeg' | 'image/png' | 'image/webp') => {
  const extension = extensions.get(contentType);
  if (!extension) throw new Error('Only JPEG, PNG, or WebP images are accepted.');
  const objectKey = `blog/uploads/${actorUserId}/${randomUUID()}.${extension}`;
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

export const processCoverUpload = async (actorUserId: string, objectKey: string, contentType: string) => {
  const extension = extensions.get(contentType);
  if (!extension || !objectKey.startsWith(`blog/uploads/${actorUserId}/`) || objectKey.includes('..')) {
    throw new Error('Invalid or unauthorized cover upload object.');
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
    .resize({ width: COVER_WIDTH, height: COVER_HEIGHT, fit: 'cover', position: 'centre' })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  const coverKey = `blog/covers/${randomUUID()}.webp`;
  await client.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: coverKey,
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
    coverKey,
    publicUrl: `${baseUrl}/${coverKey.split('/').map(encodeURIComponent).join('/')}`,
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    sizeBytes: output.length,
  };
};

/** Best effort: an orphaned object costs storage, a failed post deletion costs content. */
export const removeCoverObjects = async (keys: string[]) => {
  const uniqueKeys = [...new Set(keys.filter((key) => key.startsWith('blog/covers/')))];
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
