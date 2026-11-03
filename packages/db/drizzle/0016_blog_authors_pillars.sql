-- Ручна міграція (0013+ стиль): снапшоти meta/ зупинилися на 0004, `db:generate` зламав би історію.
-- Автори блогу та pillar-стаття категорії. Обидва пункти лише додають об'єкти й nullable-колонки:
-- жодного DROP, жодного переписування рядків, тож відкат = не застосовувати міграцію далі.

-- Автор — це людина, а не рядок перекладу: ім'я, роль і біо пишуться своєю мовою, тому
-- blog_author_translations дзеркалить форму категорій із 0015. same_as тримає профілі
-- соцмереж одним масивом на автора — вони не перекладаються.
CREATE TABLE IF NOT EXISTS blog_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_url text,
  avatar_alt text,
  same_as text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_author_translations (
  author_id uuid NOT NULL REFERENCES blog_authors(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('uk','en','de','fr')),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 200),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  role text CHECK (role IS NULL OR char_length(role) <= 120),
  bio text CHECK (bio IS NULL OR char_length(bio) <= 1000),
  seo_title text CHECK (seo_title IS NULL OR char_length(seo_title) <= 200),
  seo_description text CHECK (seo_description IS NULL OR char_length(seo_description) <= 500),
  PRIMARY KEY (author_id, locale),
  CONSTRAINT blog_author_translations_slug_locale_unique UNIQUE (slug, locale)
);

CREATE INDEX IF NOT EXISTS blog_author_translations_locale_idx
  ON blog_author_translations (locale);

-- Автор на рядку статті — nullable і без cascade-видалення: прибрати автора в CMS не може
-- означати прибрати 72 опубліковані статті. author_name (0010) лишається fallback'ом,
-- тож рядки, яких ніхто не підписав, чесно залишаються на «Constella».
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES blog_authors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS blog_posts_author_published_idx
  ON blog_posts (author_id, locale, status, published_at);

-- Pin живе на самій категорії, а не в _translations: pillar — це id групи, тобто одна
-- сутність на всю категорію, а не чотири різні «почати тут» в одній мові. Якщо у
-- прикріпленій групі немає опублікованого рядка поточної мови, блок просто не рендеримо.
ALTER TABLE blog_categories ADD COLUMN IF NOT EXISTS pinned_post_group_id uuid REFERENCES blog_post_groups(id) ON DELETE SET NULL;
