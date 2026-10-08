ALTER TABLE users
  ADD COLUMN session_version integer NOT NULL DEFAULT 0;

ALTER TABLE web_credentials
  ADD COLUMN email_verified_at timestamptz;

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_tokens_hash_unique ON auth_tokens(token_hash);
CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens(user_id, purpose);

ALTER TABLE admin_audit_logs
  ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE admin_audit_logs
  DROP CONSTRAINT IF EXISTS admin_audit_logs_actor_user_id_users_id_fk,
  DROP CONSTRAINT IF EXISTS admin_audit_logs_actor_user_id_fkey;
ALTER TABLE admin_audit_logs
  ADD CONSTRAINT admin_audit_logs_actor_user_id_users_id_fk
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payment_intents
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE payment_intents
  DROP CONSTRAINT payment_intents_user_id_users_id_fk;
ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE telegram_star_payments
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN payment_intent_id DROP NOT NULL;
ALTER TABLE telegram_star_payments
  DROP CONSTRAINT telegram_star_payments_payment_intent_id_payment_intents_id_fk,
  DROP CONSTRAINT telegram_star_payments_user_id_users_id_fk;
ALTER TABLE telegram_star_payments
  ADD CONSTRAINT telegram_star_payments_payment_intent_id_payment_intents_id_fk
    FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id) ON DELETE SET NULL,
  ADD CONSTRAINT telegram_star_payments_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE photo_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_key text NOT NULL UNIQUE,
  image_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  moderation_status text NOT NULL DEFAULT 'pending',
  moderation_score double precision,
  moderation_provider text,
  moderated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  moderation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  moderated_at timestamptz
);
CREATE INDEX photo_assets_user_status_idx ON photo_assets(user_id, moderation_status);
CREATE INDEX photo_assets_moderation_queue_idx ON photo_assets(moderation_status, created_at);
