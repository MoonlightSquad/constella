-- Ручна міграція (0005+ стиль): снапшоти meta/ зупинилися на 0004, `db:generate` зламав би історію.
-- `role` — джерело істини для доступу до консолі; env ADMIN_EMAIL/ADMIN_PASSWORD лишається root-акаунтом.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
  CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

-- Консоль показує адмінів від найновіших; частковий індекс тримає цей запит дешевим.
CREATE INDEX IF NOT EXISTS users_role_admin_created_idx
  ON users (created_at DESC) WHERE role = 'admin';
