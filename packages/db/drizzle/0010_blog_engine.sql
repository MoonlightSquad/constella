CREATE TABLE blog_post_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES blog_post_groups(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('uk','en','de','fr')),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 200),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  excerpt text NOT NULL CHECK (char_length(excerpt) BETWEEN 1 AND 500),
  body_markdown text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  cover_url text,
  cover_alt text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  reading_minutes integer NOT NULL DEFAULT 1 CHECK (reading_minutes BETWEEN 1 AND 240),
  seo_title text,
  seo_description text,
  og_image_url text,
  canonical_url text,
  noindex boolean NOT NULL DEFAULT false,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT 'Constella',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_posts_published_at_required CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE UNIQUE INDEX blog_posts_slug_locale_unique ON blog_posts(slug, locale);
CREATE UNIQUE INDEX blog_posts_group_locale_unique ON blog_posts(group_id, locale);
CREATE INDEX blog_posts_locale_status_published_idx ON blog_posts(locale, status, published_at DESC);
CREATE INDEX blog_posts_group_idx ON blog_posts(group_id);
