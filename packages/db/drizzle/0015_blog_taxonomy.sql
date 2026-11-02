-- Ручна міграція (0013+ стиль): снапшоти meta/ зупинилися на 0004, `db:generate` зламав би історію.
-- Таксономія блогу: категорії й теґи — окремі сутності з перекладами на мову. Приналежність
-- статті тримається на ГРУПІ (blog_post_groups), тож вона не залежить від мови рядка й
-- успадковується перекладами без копіювання. Слаг архіву живе в окремому namespace
-- (/blog/category/<slug>, /blog/tag/<slug>), тому не може конфліктувати зі слагом статті.

CREATE TABLE IF NOT EXISTS blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_category_translations (
  category_id uuid NOT NULL REFERENCES blog_categories(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('uk','en','de','fr')),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 200),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  seo_title text CHECK (seo_title IS NULL OR char_length(seo_title) <= 200),
  seo_description text CHECK (seo_description IS NULL OR char_length(seo_description) <= 500),
  PRIMARY KEY (category_id, locale),
  CONSTRAINT blog_category_translations_slug_locale_unique UNIQUE (slug, locale)
);

CREATE INDEX IF NOT EXISTS blog_category_translations_locale_idx
  ON blog_category_translations (locale);

CREATE TABLE IF NOT EXISTS blog_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_tag_translations (
  tag_id uuid NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('uk','en','de','fr')),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 200),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 32),
  PRIMARY KEY (tag_id, locale),
  CONSTRAINT blog_tag_translations_slug_locale_unique UNIQUE (slug, locale)
);

CREATE INDEX IF NOT EXISTS blog_tag_translations_locale_idx
  ON blog_tag_translations (locale);

CREATE TABLE IF NOT EXISTS blog_post_categories (
  post_group_id uuid NOT NULL REFERENCES blog_post_groups(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES blog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_group_id, category_id)
);

-- Фасетний запит іде з іншого боку: категорія → групи.
CREATE INDEX IF NOT EXISTS blog_post_categories_category_group_idx
  ON blog_post_categories (category_id, post_group_id);

CREATE TABLE IF NOT EXISTS blog_post_tags (
  post_group_id uuid NOT NULL REFERENCES blog_post_groups(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_group_id, tag_id)
);

CREATE INDEX IF NOT EXISTS blog_post_tags_tag_group_idx
  ON blog_post_tags (tag_id, post_group_id);

-- Вільний текст більше не джерело істини фасетів: у проді таблиця порожня (сіду немає),
-- перенесення немає. Залишити колонку = дозволити писати другу, невидиму правду про теґи.
ALTER TABLE blog_posts DROP COLUMN IF EXISTS tags;
