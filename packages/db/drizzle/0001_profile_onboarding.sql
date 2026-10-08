ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "bio" text,
  ADD COLUMN IF NOT EXISTS "prompt_one" text,
  ADD COLUMN IF NOT EXISTS "prompt_two" text,
  ADD COLUMN IF NOT EXISTS "prompt_three" text,
  ADD COLUMN IF NOT EXISTS "photos" text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "preferred_radius_km" integer DEFAULT 50 NOT NULL,
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;
