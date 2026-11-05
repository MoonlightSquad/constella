CREATE INDEX IF NOT EXISTS events_user_type_created_at_idx
  ON events (user_id, type, created_at);
