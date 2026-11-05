CREATE TABLE IF NOT EXISTS blog_tag_slug_aliases (
  tag_id uuid NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('uk', 'en', 'de', 'fr')),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_tag_slug_aliases_pkey PRIMARY KEY (locale, slug)
);

CREATE INDEX IF NOT EXISTS blog_tag_slug_aliases_tag_idx
  ON blog_tag_slug_aliases (tag_id);
