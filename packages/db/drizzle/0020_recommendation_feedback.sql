CREATE TABLE IF NOT EXISTS recommendation_feedback (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feedback_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('not_interested', 'distance', 'profile_incomplete', 'intent_mismatch', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_feedback_pkey PRIMARY KEY (user_id, profile_id, feedback_date)
);

CREATE INDEX IF NOT EXISTS recommendation_feedback_profile_idx
  ON recommendation_feedback (profile_id, feedback_date);
