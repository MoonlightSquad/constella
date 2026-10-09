import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadDeploymentConfig, mergeConfig } from './deployment-config.mjs';

test('local config overrides merge recursively without removing base settings', () => {
  assert.deepEqual(
    mergeConfig(
      { storage: { bucket: 'photos', region: 'auto' }, domains: { web: 'https://example.com' } },
      { storage: { bucket: 'private-photos' }, cloudflare: { api_token: 'local-token' } },
    ),
    {
      storage: { bucket: 'private-photos', region: 'auto' },
      domains: { web: 'https://example.com' },
      cloudflare: { api_token: 'local-token' },
    },
  );
});

test('loads and merges the ignored local override when present', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'constella-config-'));
  try {
    fs.writeFileSync(path.join(root, 'constella.deploy.config.json'), JSON.stringify({
      storage: { photo_bucket: 'photos', s3_region: 'auto' },
    }));
    fs.writeFileSync(path.join(root, 'constella.deploy.config.local.json'), JSON.stringify({
      cloudflare: { api_token: 'local-token' },
      storage: { photo_bucket: 'private-photos' },
    }));

    assert.deepEqual(loadDeploymentConfig(root), {
      storage: { photo_bucket: 'private-photos', s3_region: 'auto' },
      cloudflare: { api_token: 'local-token' },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('loads base config when the local override does not exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'constella-config-'));
  try {
    fs.writeFileSync(path.join(root, 'constella.deploy.config.json'), JSON.stringify({ storage: { photo_bucket: 'photos' } }));
    assert.deepEqual(loadDeploymentConfig(root), { storage: { photo_bucket: 'photos' } });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
