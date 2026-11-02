-- Одноразова операція з даними (не міграція): одна реальна людина замість бренду в підпису.
-- Лежить поза drizzle/, бо drizzle/ — це схема; тут переписування рядків. Жодного ALTER:
-- таблиці blog_authors / blog_author_translations і колонку blog_posts.author_id приносить
-- 0016_blog_authors_pillars, тож без застосованої міграції перший же префлайт-запит впаде на
-- «relation blog_authors does not exist» — і це правильна поведінка, а не помилка скрипту.
--
-- НАВІЩО ЙОГО ЗАПОВНЮЮТЬ РУКОЮ. Усі 72 опубліковані рядки (18 груп × 4 мови) підписані
-- вільним текстом «Constella». E-E-A-T читає людину, а не бренд. Ім'я й посаду дав редактор,
-- текст ролей і біо в блоці нижче написані за цими даними й за тим, що продукт реально робить
-- (черга модерації фото, скарги, документи «Спільнота») — тому перед запуском їх читають і
-- правлять. Вигадані регалії не вписуємо ніколи: саме за них знімають індексацію весь домен.
-- Доки `SAME_AS_…` порожні, профіль не має зовнішнього підтвердження; запуск тоді технічно
-- валідний, але слабий. Придумувати ці адреси не можна — неіснуючий або чужий URL гірший за
-- порожнечу.
--
-- ЧОМУ ВСІ СТАТТІ, А НЕ ОДНА ТЕМА. Спершу scope тримав лише «Безпеку» (модерація, скарги,
-- /legal/community — за це людина відповідає явно). Редактор сказав підписати існуючі статті,
-- тож нижче всі три категорії: 7 + 6 + 5 опублікованих груп = 18, жодна група не поза
-- категорією, тому це ті самі 72 рядки. Біо теж написане про блог загалом, а не про один
-- розділ, — підпис узгоджений із ним.
--
-- ЧОГО НЕ РОБИМО. Другий, «організаційний» автор тут навмисно не створюється: лендінг
-- рендерить кожен профіль як schema.org/Person, тому рядок «Редакція Constella» був би
-- твердженням, що бренд — це людина. Якщо згодом інша людина візьме на себе, наприклад,
-- «Стосунки», це робиться в CMS: створити автора, перекласти категорію на нього, і `author_id`
-- правиться там самим — не переписуванням цього файлу.
--
-- ІДЕМПОТЕНТНІСТЬ. Id людини — літерал у файлі, а вставки йдуть з ON CONFLICT DO NOTHING,
-- тому повторний запуск нічого не додає. Колонки перекладів при повторі НЕ оновлюються:
-- правки імені, ролі чи біо робляться в CMS («Автори»), щоб вони лишились в admin_audit_logs.
--
-- SCOPE. У яких категоріях (див. префлайт-звіт нижче) працює тема людини: впиши їх uuid у
-- CATEGORY_… . Стаття, що потрапляє у дві вибрані категорії, підписується одним рядком —
-- повторний update їй не шкодить.
--
-- ЩО НЕ ЧІПАЄТЬСЯ. `avatar_url` і `avatar_alt` лишаються NULL: фото — це файл у R2, його
-- завантажують у CMS («Автори» → «Фото автора»), де він отримує й alt-текст. Тож одразу
-- після запуску профіль варто доповнити фото в адмінці, а не в базі.
--
-- ЗАПУСК:
--   Репетиція: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/2026-11-12_author_backfill.sql
--              файл закінчується ROLLBACK, тож нічого не змінює, але друкує перевірки й обидва
--              звіти. Розкоментуй COMMIT внизу, лише коли dry-run-звіт збігся з очікуванням.
--   Лапки в значеннях: апостроф всередині значення подвоюють (O''Henry). Порожні лапки — навмисний
--   стан «не заповнено»: перший же DO-блок на них зупиняє запуск.

-- ===================== ЗАПОВНИ ЦЕЙ БЛОК =====================
-- Роль і біо нижче написані за іменем, посадою й тим, що продукт реально робить: перед
-- запуском їх читають і правлять, якщо якесь речення не є правдою.
\set NAME_UK 'Володимир Семенко'
\set NAME_EN 'Volodymyr Semenko'
\set NAME_DE 'Volodymyr Semenko'
\set NAME_FR 'Volodymyr Semenko'
-- Той самий slug у всіх чотирьох мовах: так його зробив би транслітер із CMS.
\set SLUG_UK 'volodymyr-semenko'
\set SLUG_EN 'volodymyr-semenko'
\set SLUG_DE 'volodymyr-semenko'
\set SLUG_FR 'volodymyr-semenko'
\set ROLE_UK 'генеральний директор Constella'
\set ROLE_EN 'CEO of Constella'
\set ROLE_DE 'CEO von Constella'
\set ROLE_FR 'directeur général de Constella'
\set BIO_UK 'Володимир Семенко — генеральний директор Constella. Відповідає за продукт і за правила спільноти: чергу модерації фото, скарги на профілі та відкриті документи про безпеку. У блогу пояснює, як онлайн-знайомства влаштовані зсередини і що в них ламається на практиці.'
\set BIO_EN 'Volodymyr Semenko is the CEO of Constella. He owns the product and the community rules: the photo moderation queue, profile reports and the public safety documentation. On the blog he explains how online dating is built from the inside, and what breaks in practice.'
\set BIO_DE 'Volodymyr Semenko ist CEO von Constella. Er verantwortet das Produkt und die Community-Regeln: die Moderations-Warteschlange für Fotos, die Meldungen von Profilen und die öffentlichen Sicherheitsdokumente. Im Blog erklärt er, wie Online-Dating von innen aufgebaut ist und was in der Praxis nicht funktioniert.'
\set BIO_FR 'Volodymyr Semenko est le directeur général de Constella. Il répond du produit et des règles de la communauté : la file de modération des photos, les signalements de profils et les documents publics sur la sécurité. Sur le blog, il explique comment les rencontres en ligne sont construites et ce qui dysfonctionne en pratique.'
-- Необов'язкове: без цих рядків SEO-поля візьмуться з імені й біо.
\set SEO_TITLE_UK ''
\set SEO_TITLE_EN ''
\set SEO_TITLE_DE ''
\set SEO_TITLE_FR ''
\set SEO_DESC_UK ''
\set SEO_DESC_EN ''
\set SEO_DESC_DE ''
\set SEO_DESC_FR ''
-- ДОПОВНИТИ ВРУЧНУ. Тут лишилось порожньо принципово: посилання на профіль — це твердження,
-- що конкретна сторінка в інтернеті належить цій людині. Придумати їх не можна, а
-- неіснуюча або чужа адреса робить профіль гіршим, ніж без профілю.
\set SAME_AS_1 ''
\set SAME_AS_2 ''
\set SAME_AS_3 ''
\set SAME_AS_4 ''
-- Категорії, чий вміст підписуємо: uuid з першого префлайт-звіту нижче. Всі три, що мають
-- опубліковані статті — див. абзац «ЧОМУ ВСІ СТАТТІ, А НЕ ОДНА ТЕМА» вгорі.
\set CATEGORY_1 'd131a73f-0b7f-4b55-a633-5c4c339217a1'
\set CATEGORY_2 '637e8286-48af-4b6e-af87-370a080e7b6e'
\set CATEGORY_3 '26c5ee12-cac4-4610-9df7-0bb925ae9d26'
\set CATEGORY_4 ''
\set CATEGORY_5 ''
-- =============================================================

BEGIN;

-- Id обирається один раз і лишається в файлі: він і є ознака того, що повторний запуск не
-- створить другу людину з тим самим ім'ям.
create temp table author_person (id uuid) on commit drop;

insert into author_person (id) values ('3d9ffca9-4c1c-4dd4-b1d3-3d0b9819ee90');

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

create temp table author_scope (category_id uuid) on commit drop;

insert into author_scope (category_id)
select picked::uuid
from unnest(array[:'CATEGORY_1', :'CATEGORY_2', :'CATEGORY_3', :'CATEGORY_4', :'CATEGORY_5']) as picked_rows (picked)
where picked <> '';

-- Префлайт. Перший рядок перевіряє, що 0016 застосовано; другий дає uuid для CATEGORY_…;
-- третій показує, скільки рядків уже підписано брендом.
select count(*)::int as authors_in_db from blog_authors;

select c.id, t.slug as uk_slug, t.name as uk_name,
       count(distinct p.group_id) filter (where p.status = 'published' and p.published_at <= now())::int as published_groups
from blog_categories c
join blog_category_translations t on t.category_id = c.id and t.locale = 'uk'
left join blog_post_categories pc on pc.category_id = c.id
left join blog_posts p on p.group_id = pc.post_group_id
group by c.id, t.slug, t.name
order by published_groups desc;

select count(*)::int as brand_rows, count(distinct group_id)::int as brand_groups
from blog_posts
where author_id is null and lower(author_name) = 'constella';

do $$
declare
  blanks int;
  short_text int;
  bad_slugs int;
  bad_links int;
  unknown_categories int;
  taken int;
  scoped_rows int;
begin
  -- Порожні лапки = блок «ЗАПОВНИ ЦЕЙ БЛОК» не заповнено.
  select count(*) into blanks from author_seed where name = '' or slug = '' or role = '' or bio = '';
  if blanks > 0 then
    raise exception 'не заповнено % значень — скрипт не запускати', blanks;
  end if;

  -- Роль і біо — усе, заради чого профіль існує: порожні чи на одне слово нічого не додають.
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

  -- Без категорій скрипт підписав би нуль рядків і мовчки завершився успішно: краще зупинитися.
  if (select count(*) from author_scope) = 0 then
    raise exception 'не вибрано жодної категорії — скрипт не підписав би нічого';
  end if;

  select count(*) into unknown_categories from author_scope s
  where not exists (select 1 from blog_categories c where c.id = s.category_id);
  if unknown_categories > 0 then
    raise exception 'категорій % із CATEGORY_… не існує — візьми uuid з префлайт-звіту', unknown_categories;
  end if;

  -- Зайнятий slug у тій самій мові впаде на unique-індексі, а в іншій — тихенько створив би
  -- другу людину з тим самим ім'ям.
  select count(*) into taken from author_seed s
  where exists (select 1 from blog_author_translations t where t.slug = s.slug and t.locale = s.locale);
  if taken > 0 then
    raise exception 'slug уже зайнятий у % мовах — профіль, схоже, створено в CMS', taken;
  end if;

  select count(*) into scoped_rows from blog_posts p
  where p.author_id is null
    and exists (select 1 from author_scope s join blog_post_categories pc on pc.category_id = s.category_id
                where pc.post_group_id = p.group_id);
  if scoped_rows = 0 then
    raise exception 'у вибраних категоріях немає жодного непідписаного рядка';
  end if;
end $$;

-- Крок 1. Сутність: аватар лишається NULL (фото — із CMS), sameAs — масив наданих адрес.
insert into blog_authors (id, avatar_url, avatar_alt, same_as)
select p.id, null, null, coalesce((select array_agg(url order by url) from author_links), '{}')
from author_person p
on conflict (id) do nothing;

-- Крок 2. Чотири переклади.
insert into blog_author_translations (author_id, locale, slug, name, role, bio, seo_title, seo_description)
select p.id, s.locale, s.slug, s.name, s.role, s.bio, s.seo_title, s.seo_description
from author_person p
cross join author_seed s
on conflict (author_id, locale) do nothing;

-- Крок 3. Підпис. author_name лишається як є: якщо в людини зникне переклад мови статті,
-- публічна проєкція поверне автора null, і рядок чесно залишиться на вільному тексті.
update blog_posts
set author_id = (select id from author_person)
where author_id is null
  and exists (
    select 1 from author_scope s
    join blog_post_categories pc on pc.category_id = s.category_id
    where pc.post_group_id = blog_posts.group_id
  );

-- Звіт: профіль і те, скільки він тепер підписує.
select t.locale, t.slug, t.name, left(t.role, 40) as role, char_length(t.bio) as bio_chars
from blog_author_translations t
where t.author_id = (select id from author_person)
order by t.locale;

select p.locale, p.status, count(*)::int as rows
from blog_posts p
where p.author_id = (select id from author_person)
group by p.locale, p.status
order by p.locale, p.status;

-- Репетиція закінчується тут: ROLLBACK знімає все, окрім перевірок і друків вище.
ROLLBACK;
-- Для бойового запуску: прибери рядок вище і розкоментуй цей.
-- COMMIT;
