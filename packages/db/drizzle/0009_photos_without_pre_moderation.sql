ALTER TABLE photo_assets
  ALTER COLUMN moderation_status SET DEFAULT 'approved';

UPDATE photo_assets
SET moderation_status = 'approved',
    moderation_provider = 'automatic',
    moderated_at = COALESCE(moderated_at, now())
WHERE moderation_status = 'pending';
