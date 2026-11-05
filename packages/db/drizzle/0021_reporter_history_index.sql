CREATE INDEX IF NOT EXISTS reports_reporter_created_at_idx
  ON reports (reporter_id, created_at);
