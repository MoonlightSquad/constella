ALTER TABLE reports
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN moderator_note text;

CREATE TABLE admin_audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  report_id bigint REFERENCES reports(id) ON DELETE SET NULL,
  action text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_logs_actor_idx ON admin_audit_logs (actor_user_id, created_at);
CREATE INDEX admin_audit_logs_target_idx ON admin_audit_logs (target_user_id, created_at);
CREATE INDEX admin_audit_logs_created_idx ON admin_audit_logs (created_at);
