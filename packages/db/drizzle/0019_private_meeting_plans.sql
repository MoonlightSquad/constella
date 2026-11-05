CREATE TABLE IF NOT EXISTS meeting_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  venue_name text NOT NULL CHECK (char_length(venue_name) BETWEEN 2 AND 100),
  city text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_plans_user_match_unique UNIQUE (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS meeting_plans_match_idx
  ON meeting_plans (match_id);
