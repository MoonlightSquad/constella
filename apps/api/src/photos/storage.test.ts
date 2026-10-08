import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createPhotoUpload, isPhotoStorageConfigured, processPhotoUpload } from './storage.js';

const names = ['PHOTO_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
after(() => { for (const name of names) original[name] === undefined ? delete process.env[name] : process.env[name] = original[name]; });

describe('photo storage validation', () => {
  it('requires every S3 setting', () => {
    for (const name of names) delete process.env[name];
    assert.equal(isPhotoStorageConfigured(), false);
    for (const name of names) process.env[name] = 'configured';
    assert.equal(isPhotoStorageConfigured(), true);
  });
  it('rejects unsupported MIME types before touching S3', async () => {
    await assert.rejects(createPhotoUpload('user-1', 'image/svg+xml'), /Only JPEG, PNG, or WebP/);
    await assert.rejects(createPhotoUpload('user-1', 'application/octet-stream'), /Only JPEG, PNG, or WebP/);
  });
  it('rejects keys outside the caller upload namespace', async () => {
    await assert.rejects(processPhotoUpload('user-1', 'uploads/user-2/photo.jpg', 'image/jpeg'), /Invalid or unauthorized/);
    await assert.rejects(processPhotoUpload('user-1', 'uploads/user-1/../other.jpg', 'image/jpeg'), /Invalid or unauthorized/);
    await assert.rejects(processPhotoUpload('user-1', 'uploads/user-1/photo.svg', 'image/svg+xml'), /Invalid or unauthorized/);
  });
});
