-- Одноразова операція з даними (не міграція): злиття тонких тегів блогу.
-- Лежить поза drizzle/, бо drizzle/ — це схема й її нумерація, а тут лише переписування
-- рядків у вже існуючих таблицях. Жодного ALTER, жодного DROP TABLE.
--
-- НАВІЩО. Архів теґу з однією статтею — thin page: він не дає читачеві вибору, а краулеру
-- — контенту. Код із Кроку 7 уже робить такий архів noindex, follow і прибирає його з
-- sitemap (HAVING count >= 2). Злиття — другий, грубіший крок: прибрати саму сутність.
--
-- ПОРЯДОК ВАЖЛИВИЙ. Спершу задеплоїти код і дати Google перезібрати ці URL як noindex,
-- і лише потім виконувати файл. Інакше проіндексована сторінка просто стане 404. Якщо
-- порядок не дотримано, замість 404 можна додати 20 записів у nitro-редиректи лендінгу
-- (/blog/tag/<старий> -> /blog/tag/<новий>, з префіксами /en /de /fr) — карти скопійованих
-- статей це переживають, бо ведуть на архів, а не на статтю.
--
-- ЩО ЛИШИЛОСЯ НЕЧІПАНИМ. Теґи, на які посилаються тіла статей (mayzing/ghosting,
-- konflikty/conflict, pytannya/questions, spilkuvannya/communication), не чіпаємо:
-- видалення будь-якого з них зламало б внутрішні посилання в тілах: 8 на ghosting/mayzing
-- і 8 на conflict-сімʼю (konflikty, conflict, konflikte, conflits).
-- Їх лікує noindex, а не руйнування. Перевірено запитом по body_markdown, excerpt,
-- seo_description, canonical_url і описах категорій — у видалених пʼяти посилань нуль.
--
-- МЕПІНГ (джерело -> ціль; id теґа, слаг uk у дужках):
--   02472d2c-b827-4745-a313-770040531622 (astrologiya) -> 202bebd3-25d8-4693-855f-dea203a1656d (spilni-interesy)
--   d3bebfd7-9df8-4efe-a1b6-a72efbc759a3 (na-vidstani) -> 415a2b71-57d6-4f0d-af23-8185d99182e5 (online-znayomstva)
--   3e100d33-24ab-4dad-ae8b-ce111e67c32f (profili)     -> 415a2b71-57d6-4f0d-af23-8185d99182e5 (online-znayomstva)
--   52aba36d-960b-485a-a370-8d8d67724ce0 (ketfishing)  -> 12792063-926a-4761-884f-dd0b486bbb49 (skam)
--   aff38eb1-596a-443b-a8c8-ef0812226325 (videoveryfikatsiya) -> 12792063-926a-4761-884f-dd0b486bbb49 (skam)
-- Очікуваний після: spilni-interesy 4, online-znayomstva 4, skam 3, pershe-pobachennya 2;
-- решта чотирьох — по 1, вони й далі noindex.
--
-- Після злиття назву «Скам» ліпше перейменувати на щось ширше (Безпека / Safety) — це
-- робиться у CMS, щоб зміна лишилась в admin_audit_logs, а не в цьому файлі.
--
-- ЗАПУСК:
--   Репетиція: psql "$DATABASE_URL" -f packages/db/sql/2026-11-12_tag_consolidation.sql -v ON_ERROR_STOP=1
--              файл закінчується ROLLBACK, тож репетиція нічого не змінює, але друкує обидва
--              звіти. Нижче лишився закоментований COMMIT — розкоментуй його, лише коли
--              dry-run-звіт збігся з очікуванням.
--   Повторний запуск безпечний: джерел уже немає, тож insert і delete не роблять нічого.

-- Префлайт: що є зараз. Має збігтися з мепінгом у коментарі, інакше база відрізняється
-- від того, що ми бачили, — і файл запускати не треба.
select tt.locale, tt.slug, count(distinct pt.post_group_id)::int as groups
from blog_tags t
join blog_tag_translations tt on tt.tag_id = t.id
left join blog_post_tags pt on pt.tag_id = t.id
group by tt.locale, tt.slug
order by groups asc, tt.slug;

BEGIN;

create temp table tag_merge (source_id uuid not null, target_id uuid not null) on commit drop;

insert into tag_merge (source_id, target_id) values
  ('02472d2c-b827-4745-a313-770040531622', '202bebd3-25d8-4693-855f-dea203a1656d'),
  ('d3bebfd7-9df8-4efe-a1b6-a72efbc759a3', '415a2b71-57d6-4f0d-af23-8185d99182e5'),
  ('3e100d33-24ab-4dad-ae8b-ce111e67c32f', '415a2b71-57d6-4f0d-af23-8185d99182e5'),
  ('52aba36d-960b-485a-a370-8d8d67724ce0', '12792063-926a-4761-884f-dd0b486bbb49'),
  ('aff38eb1-596a-443b-a8c8-ef0812226325', '12792063-926a-4761-884f-dd0b486bbb49');

do $$
declare
  unknown_sources int;
  chained int;
begin
  -- Джерела мають існувати: інакше друкуємо мепінг із файлу й думаємо, що все злилось.
  select count(*) into unknown_sources
  from tag_merge m
  where not exists (select 1 from blog_tags t where t.id = m.source_id);
  if unknown_sources > 0 then
    raise exception 'теґів-джерел не знайдено: % — файл не запускати', unknown_sources;
  end if;

  -- Ланцюга (A -> B, B -> C) тут немає і бути не може: delete пройшовся б по B уже після
  -- того, як B прийняло статті A, і статті A зникли б разом із B.
  select count(*) into chained
  from tag_merge m
  where exists (select 1 from tag_merge x where x.source_id = m.target_id);
  if chained > 0 then
    raise exception 'ланцюгове злиття: % — перевіри мепінг', chained;
  end if;
end $$;

-- Крок 1. Переписуємо звʼязки на ціль. Повтор можливий: стаття вже може мати цільовий теґ
-- (наприклад «Профіль» і «Онлайн-знайомства» стояли на одному рядку), тому ON CONFLICT.
insert into blog_post_tags (post_group_id, tag_id)
select distinct l.post_group_id, m.target_id
from blog_post_tags l
join tag_merge m on m.source_id = l.tag_id
on conflict (post_group_id, tag_id) do nothing;

-- Крок 2. Перевірка, перш ніж видаляти: кожна пара «група -> ціль» має бути на місці.
-- Піднята помилка відкочує весь транзакт, тож каскадне видалення не може забрати статті.
do $$
declare missing int;
begin
  select count(*) into missing
  from blog_post_tags l
  join tag_merge m on m.source_id = l.tag_id
  where not exists (
    select 1 from blog_post_tags t2
    where t2.tag_id = m.target_id and t2.post_group_id = l.post_group_id
  );
  if missing > 0 then
    raise exception 'злиття не повне: % звʼязків не перенесено', missing;
  end if;
end $$;

-- Крок 3. Саме видалення. blog_tag_translations і blog_post_tags йдуть за cascade
-- (0015), тому окрім цього рядка додаткових DELETE не потрібно.
delete from blog_tags where id in (select source_id from tag_merge);

-- Звіт: те, що мали побачити. Теґів 8, жоден thin не зник разом із статтями.
select tt.locale, tt.slug, count(distinct pt.post_group_id)::int as groups
from blog_tags t
join blog_tag_translations tt on tt.tag_id = t.id
left join blog_post_tags pt on pt.tag_id = t.id
group by tt.locale, tt.slug
order by groups desc, tt.slug;

-- Репетиція закінчується тут: ROLLBACK знімає все, окрім двох друкованих звітів.
ROLLBACK;
-- Для бойового запуску: прибери рядок вище і розкоментуй цей.
-- COMMIT;
