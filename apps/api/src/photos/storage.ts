import { randomUUID } from 'node:crypto';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const uploadMimes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const voiceMimes = new Map([
  ['audio/webm', 'webm'],
  ['audio/ogg', 'ogg'],
  ['audio/mp4', 'm4a'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/aac', 'aac'],
]);

export const isPhotoStorageConfigured = () => Boolean(
  process.env.PHOTO_BUCKET &&
  process.env.S3_REGION &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY &&
  process.env.S3_PUBLIC_BASE_URL
);

const getClient = () => {
  if (!isPhotoStorageConfigured()) throw new Error('S3 photo storage is not configured.');
  const endpoint = process.env.S3_ENDPOINT;
  return new S3Client({
    region: process.env.S3_REGION!,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
};

const bucket = () => {
  if (!process.env.PHOTO_BUCKET) throw new Error('PHOTO_BUCKET is not configured.');
  return process.env.PHOTO_BUCKET;
};

export const createPhotoUpload = async (userId: string, contentType: string) => {
  const extension = uploadMimes.get(contentType);
  if (!extension) throw new Error('Only JPEG, PNG, or WebP images are accepted.');
  const objectKey = `uploads/${userId}/${randomUUID()}.${extension}`;
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: objectKey,
    ContentType: contentType,
    CacheControl: 'private, no-store',
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 600 });
  return { objectKey, uploadUrl, expiresInSeconds: 600, maxBytes: MAX_UPLOAD_BYTES, contentType };
};

export const createVoiceUpload = async (userId: string, contentType: string) => {
  const extension = voiceMimes.get(contentType);
  if (!extension) throw new Error('Only WebM, OGG, MP4/M4A, MP3, WAV, or AAC audio files are accepted.');
  const objectKey = `uploads/${userId}/${randomUUID()}.${extension}`;
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: objectKey,
    ContentType: contentType,
    CacheControl: 'private, no-store',
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 600 });
  return { objectKey, uploadUrl, expiresInSeconds: 600, maxBytes: MAX_UPLOAD_BYTES, contentType };
};

export const processVoiceUpload = async (userId: string, objectKey: string, contentType: string) => {
  const extension = voiceMimes.get(contentType);
  if (!extension || !objectKey.startsWith(`uploads/${userId}/`) || objectKey.includes('..')) {
    throw new Error('Invalid or unauthorized voice upload object.');
  }
  const client = getClient();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: objectKey }));
  if (!head.ContentLength || head.ContentLength > MAX_UPLOAD_BYTES || head.ContentLength < 1) {
    throw new Error('Audio file must be between 1 byte and 10 MB.');
  }

  const voiceId = randomUUID();
  const audioKey = `voice/${userId}/${voiceId}.${extension}`;
  const response = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: objectKey }));
  if (!response.Body) throw new Error('Uploaded audio could not be read.');
  const buffer = Buffer.from(await response.Body.transformToByteArray());

  await client.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: audioKey,
    Body: buffer,
    ContentType: contentType,
    ContentLength: buffer.length,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const baseUrl = process.env.S3_PUBLIC_BASE_URL!.replace(/\/$/, '');
  const publicUrl = `${baseUrl}/${audioKey.split('/').map(encodeURIComponent).join('/')}`;
  await client.send(new DeleteObjectsCommand({
    Bucket: bucket(),
    Delete: { Objects: [{ Key: objectKey }], Quiet: true },
  }));

  return { audioKey, publicUrl, sizeBytes: buffer.length };
};

export const processPhotoUpload = async (userId: string, objectKey: string, contentType: string) => {
  const extension = uploadMimes.get(contentType);
  if (!extension || !objectKey.startsWith(`uploads/${userId}/`) || objectKey.includes('..')) {
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
  if (original.length > MAX_UPLOAD_BYTES) throw new Error('Image exceeds the 10 MB limit.');
  const image = sharp(original, { limitInputPixels: 30_000_000, failOn: 'error' });
  const metadata = await image.metadata();
  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
    throw new Error('File content is not a supported raster image.');
  }
  const output = await image.rotate().resize({
    width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true,
  }).webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });

  const imageId = randomUUID();
  const imageKey = `profiles/${userId}/${imageId}.webp`;
  await client.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: imageKey,
    Body: output.data,
    ContentType: 'image/webp',
    ContentLength: output.data.length,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  const baseUrl = process.env.S3_PUBLIC_BASE_URL!.replace(/\/$/, '');
  const publicUrl = `${baseUrl}/${imageKey.split('/').map(encodeURIComponent).join('/')}`;
  await client.send(new DeleteObjectsCommand({
    Bucket: bucket(),
    Delete: { Objects: [{ Key: objectKey }], Quiet: true },
  }));
  return { imageKey, publicUrl, width: output.info.width, height: output.info.height };
};

export const moderatePhoto = async (imageKey: string) => {
  const client = getClient();
  const moderationUrl = process.env.CONTENT_MODERATION_URL;
  if (!moderationUrl) return { status: 'pending' as const, score: null, provider: 'manual' };
  const imageUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket(), Key: imageKey }), { expiresIn: 300 });
  const response = await fetch(moderationUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.CONTENT_MODERATION_TOKEN ? { authorization: `Bearer ${process.env.CONTENT_MODERATION_TOKEN}` } : {}),
    },
    body: JSON.stringify({ imageUrl }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Content moderation service returned HTTP ${response.status}.`);
  const result = await response.json() as { safe?: unknown; score?: unknown };
  if (typeof result.safe !== 'boolean') throw new Error('Content moderation response must include a boolean safe field.');
  const score = typeof result.score === 'number' && Number.isFinite(result.score)
    ? Math.max(0, Math.min(1, result.score))
    : null;
  return { status: result.safe ? 'approved' as const : 'rejected' as const, score, provider: 'configured-api' };
};

export const removePhotoObjects = async (keys: string[]) => {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (!uniqueKeys.length) return;
  const client = getClient();
  const response = await client.send(new DeleteObjectsCommand({
    Bucket: bucket(),
    Delete: { Objects: uniqueKeys.map((Key) => ({ Key })), Quiet: false },
  }));
  if (response.Errors?.length) throw new Error(`Could not delete ${response.Errors.length} object(s) from photo storage.`);
};
