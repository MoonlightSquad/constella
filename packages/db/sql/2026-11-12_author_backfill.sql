-- Одноразова операція з даними (не міграція): один реальний автор і підпис ним статтей.
-- Лежить поза drizzle/, бо drizzle/ — це схема; тут переписування рядків. Жодного ALTER:
-- таблиці blog_authors / blog_author_translations і колонку blog_posts.author_id приносить
-- 0016_blog_authors_pillars, тож без застосованої міграції перший же префлайт-запит впаде
-- на «relation blog_authors does not exist» — і це правильна поведінка, а не помилка скрипту.
--
-- НАВІЩО ЙОГО ЗАПОВНЮЮТЬ РУКОЮ. Усі 72 опубліковані рядки (18 груп × 4 мови) підписані
-- вільним текстом «Constella». Такий підпис не дає нічого, заради чого авторські сторінки
-- й робляться: E-E-A-T читає людину, а не бренд. Людину вписує редактор — ім'я, роль, біо й
-- профілі мають бути правдою. Вигадані регалії не вписуємо ніколи: за них знімають
-- індексацію весь домен, а не одну сторінку.
--
-- ЩО ЛИШИЛОСЯ НЕЧІПАНИМ. `avatar_url` і `avatar_alt` скрипт не пише: фото — це файл у R2,
-- його завантажують у CMS («Автори» → «Фото автора»), там же він отримує alt-текст. Тож
-- одразу після запуску профіль варто доповнити фото в адмінці, а не в базі.
--
-- SCOPE. Підпис переписується за рядком author_name: всі рядки, що досі підписані ним,
-- йдуть до людини, включно з чернетками — інакше наступна публікація тихо вийшла б під
-- брендом. Якщо людина має підписати лише частину тем, додай у WHERE останнього update
-- `and group_id in (…)` зі списком груп (їх видно з
-- `select group_id, locale, title from blog_posts where author_name = '…'`).
--
-- ЗАПУСК:
--   Репетиція: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/2026-11-12_author_backfill.sql
--              файл закінчується ROLLBACK, тож нічого не змінює, але друкує перевірки й обидва
--              звіти. Розкоментуй COMMIT внизу, лише коли dry-run-звіт збігся з очікуванням.
--   Лапки в значеннях: внутрішній апостроф подвой (O''Henry). Порожні лапки — навмисний стан
--   «не заповнено»: перший же DO-блок на них зупиняє запуск.

-- ===================== ЗАПОВНИ ЦЕЙ БЛОК =====================
\set NAME_UK ''
\set NAME_EN ''
\set NAME_DE ''
\set NAME_FR ''
\set SLUG_UK ''
\set SLUG_EN ''
\set SLUG_DE ''
\set SLUG_FR ''
\set ROLE_UK ''
\set ROLE_EN ''
\set ROLE_DE ''
\set ROLE_FR ''
\set BIO_UK ''
\set BIO_EN ''
\set BIO_DE ''
\set BIO_FR ''
-- Необов'язкове: без цих рядків SEO-поля візьмуться з імені й біо.
\set SEO_TITLE_UK ''
\set SEO_TITLE_EN ''
\set SEO_TITLE_DE ''
\set SEO_TITLE_FR ''
\set SEO_DESC_UK ''
\set SEO_DESC_EN ''
\set SEO_DESC_DE ''
\set SEO_DESC_FR ''
-- Профілі, що підтверджують існування людини: повні URL; порожні лапки пропускаються.
\set SAME_AS_1 ''
\set SAME_AS_2 ''
\set SAME_AS_3 ''
\set SAME_AS_4 ''
-- Підпис, який переписуємо: досі це бренд.
\set FROM_BYLINE 'Constella'
-- ============================================================

BEGIN;

create temp table author_seed (
  locale text not null,
  name text not null,
  slug text not null,
  role text not null,
  bio text not null,
  seo_title text,
  seo_description text
) on commit drop;

insert into author_seed (locale, name, slug, role, bio, seo_title, seo_description) values
  ('uk', :'NAME_UK', :'SLUG_UK', :'ROLE_UK', :'BIO_UK', nullif(:'SEO_TITLE_UK', ''), nullif(:'SEO_DESC_UK', '')),
  ('en', :'NAME_EN', :'SLUG_EN', :'ROLE_EN', :'BIO_EN', nullif(:'SEO_TITLE_EN', ''), nullif(:'SEO_DESC_EN', '')),
  ('de', :'NAME_DE', :'SLUG_DE', :'ROLE_DE', :'BIO_DE', nullif(:'SEO_TITLE_DE', ''), nullif(:'SEO_DESC_DE', '')),
  ('fr', :'NAME_FR', :'SLUG_FR', :'ROLE_FR', :'BIO_FR', nullif(:'SEO_TITLE_FR', ''), nullif(:'SEO_DESC_FR', ''));

create temp table author_links (url text) on commit drop;

insert into author_links (url)
select url
from unnest(array[:'SAME_AS_1', :'SAME_AS_2', :'SAME_AS_3', :'SAME_AS_4']) as links (url)
where url <> '';

-- psql-підстановку всередину DO-блока не тягнемо: звідси її читають лише звичайні запити.
create temp table seed_byline (value text) on commit drop;

insert into seed_byline (value) values (:'FROM_BYLINE');

-- Префлайт. Перший рядок перевіряє, що 0016 застосовано; далі — що підпис, який переписуємо,
-- на місці, а профілів у базі ще немає.
select count(*)::int as authors_in_db from blog_authors;

select status, count(*)::int as rows, count(distinct group_id)::int as groups
from blog_posts
where lower(author_name) = (select lower(value) from seed_byline)
group by status
order by status;

do $$
declare
  blanks int;
  short_text int;
  bad_slugs int;
  bad_links int;
  taken int;
  byline_groups int;
  byline text;
begin
  select value into byline from seed_byline;

  -- Порожні лапки = блок «ЗАПОВНИ ЦЕЙ БЛОК» не заповнено.
  select count(*) into blanks from author_seed where name = '' or slug = '' or role = '' or bio = '';
  if blanks > 0 then
    raise exception 'не заповнено % значень — скрипт не запускати', blanks;
  end if;

  -- Роль і біо — усе, заради чого профіль існує: порожні чи на одне слово вони нічого не додають.
  select count(*) into short_text from author_seed where char_length(role) < 3 or char_length(bio) < 80;
  if short_text > 0 then
    raise exception 'роль коротша за 3 символи або біо коротше за 80: % рядків', short_text;
  end if;

  -- Код лендінгу приймає лише таку форму slug; інакше /blog/author/<…> не складе hreflang-кластер.
  select count(*) into bad_slugs from author_seed
  where slug !~ '^[a-z0-9]([a-z0-9-]{0,198}[a-z0-9])?$';
  if bad_slugs > 0 then
    raise exception 'slug не у формі a-z, 0-9 і дефіс: % рядків', bad_slugs;
  end if;

  select count(*) into bad_links from author_links where url !~ '^https?://';
  if bad_links > 0 then
    raise exception 'sameAs приймає лише повні http(s)-адреси: %', bad_links;
  end if;

  -- Вже зайнято? Дубляж у тій самій мові впаде на unique-індексі, а в іншій — тихенько
  -- створить другу людину з тим самим ім'ям.
  select count(*) into taken from author_seed s
  where exists (select 1 from blog_author_translations t where t.slug = s.slug and t.locale = s.locale);
  if taken > 0 then
    raise exception 'slug уже зайнятий у % мовах — профіль, схоже, створено в CMS', taken;
  end if;

  select count(distinct group_id) into byline_groups
  from blog_posts
  where lower(author_name) = lower(byline);
  if byline_groups = 0 then
    raise exception 'рядків із підписом «%» немає — перевіри FROM_BYLINE', byline;
  end if;
end $$;

-- Id генеруємо тут, а не в insert: у PostgreSQL `INSERT ... RETURNING` не має INTO, тому без
-- готового uuid решта довела б читати щойно створену сутність назад із бази.
create temp table author_created (id uuid) on commit drop;

insert into author_created (id) values (gen_random_uuid());

-- Крок 1. Сутність: аватар лишається NULL (фото — із CMS), sameAs — масив наданих адрес.
insert into blog_authors (id, avatar_url, avatar_alt, same_as)
select a.id, null, null, coalesce((select array_agg(url order by url) from author_links), '{}')
from author_created a;

-- Крок 2. Чотири переклади.
insert into blog_author_translations (author_id, locale, slug, name, role, bio, seo_title, seo_description)
select a.id, s.locale, s.slug, s.name, s.role, s.bio, s.seo_title, s.seo_description
from author_created a
cross join author_seed s;

-- Крок 3. Підпис статтей. author_name лишається як є: якщо в людини зникне переклад мови
-- статті, публічна проєкція поверне автора null, і рядок чесно залишиться на тексті.
update blog_posts
set author_id = (select id from author_created)
where lower(author_name) = (select lower(value) from seed_byline);

-- Звіт: профіль і те, скільки він тепер підписує.
select t.locale, t.slug, t.name, left(t.role, 40) as role, char_length(t.bio) as bio_chars
from blog_author_translations t
join author_created a on a.id = t.author_id
order by t.locale;

select p.locale, p.status, count(*)::int as rows
from blog_posts p
join author_created a on a.id = p.author_id
group by p.locale, p.status
order by p.locale, p.status;

-- Репетиція закінчується тут: ROLLBACK знімає все, окрім перевірок і друків вище.
ROLLBACK;
-- Для бойового запуску: прибери рядок вище і розкоментуй цей.
-- COMMIT;
