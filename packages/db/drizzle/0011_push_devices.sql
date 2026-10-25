-- Expo push-пристрої користувача. Пишеться вручну (0005+ стиль): `db:generate`
-- ламає історію, бо снапшоти `meta/` зупинилися на 0004.
CREATE TABLE IF NOT EXISTS push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  push_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS push_devices_token_unique ON push_devices(push_token);
CREATE INDEX IF NOT EXISTS push_devices_user_idx ON push_devices(user_id);
