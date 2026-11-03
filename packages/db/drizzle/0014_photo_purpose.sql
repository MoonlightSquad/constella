-- Ручна міграція (0005+ стиль): снапшоти meta/ зупинилися на 0004, `db:generate` зламав би історію.
-- Чат-фото більше не змішуються з фото профілю: `purpose` вирішує, чи впливає ассет
-- на ліміт 6 фото та на `users.photos` (і при confirm, і при схваленні адміном).
ALTER TABLE photo_assets
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'profile'
  CONSTRAINT photo_assets_purpose_check CHECK (purpose IN ('profile', 'chat'));

-- Профільна галерея: фільтр (user, purpose, status); чат-фото в неї не потрапляють.
CREATE INDEX IF NOT EXISTS photo_assets_user_purpose_status_idx
  ON photo_assets (user_id, purpose, moderation_status);

-- `social.sendMessage` перевіряє статус зображення за URL перед доставкою в чат.
CREATE INDEX IF NOT EXISTS photo_assets_public_url_idx
  ON photo_assets (public_url);
