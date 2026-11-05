import { blogArchivePath, blogIndexPath, blogPath, escapeXml } from './feed.mjs';

const LOCALES = ['uk', 'en', 'de', 'fr'];
const LANGUAGE = { uk: 'uk-UA', en: 'en-US', de: 'de-DE', fr: 'fr-FR' };

/**
 * Сторінки, яких немає в базі: кластер у них повний за побудовою, бо чотири варіанти
 * відрізняються лише префіксом мови.
 */
const pageGroup = (pathForLocale) =>
  LOCALES.map((locale) => ({
    loc: pathForLocale(locale),
    alternatives: [
      { hreflang: 'x-default', href: pathForLocale('uk') },
      ...LOCALES.map((language) => ({ hreflang: LANGUAGE[language], href: pathForLocale(language) })),
    ],
  }));

export const staticSitemapEntries = () => [
  ...pageGroup((locale) => (locale === 'uk' ? '/' : `/${locale}`)),
  ...pageGroup(blogIndexPath),
  ...['privacy', 'terms', 'community'].flatMap((slug) =>
    pageGroup((locale) => (locale === 'uk' ? `/legal/${slug}` : `/${locale}/legal/${slug}`)),
  ),
  ...pageGroup((locale) => (locale === 'uk' ? '/security' : `/${locale}/security`)),
];

/** Рядки `/blog/sitemap`: одна стаття — багато мов, тому альтернативи збираються по групі. */
export const postSitemapEntries = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const siblings = groups.get(row.groupId) ?? [];
    siblings.push(row);
    groups.set(row.groupId, siblings);
  }
  return [...groups.values()].flatMap((group) => {
    const primary = group.find((row) => row.locale === 'uk') ?? group[0];
    const alternatives = [
      { hreflang: 'x-default', href: blogPath(primary.locale, primary.slug) },
      ...group.map((row) => ({ hreflang: LANGUAGE[row.locale], href: blogPath(row.locale, row.slug) })),
    ];
    return group.map((row) => ({
      loc: blogPath(row.locale, row.slug),
      // Кожна мова правиться у своїй графіку, тож і дату кожна показує свою.
      lastmod: new Date(Date.parse(row.updatedAt)).toISOString(),
      alternatives,
    }));
  });
};

/**
 * Рядки `/blog/sitemap/taxonomy`: термін не має власної дати редагування, тому `lastmod`
 * — найновіший `updated_at` серед його статей: саме він і є зміна цієї сторінки.
 */
export const taxonomySitemapEntries = (payload) => {
  const groupById = (rows) => {
    const groups = new Map();
    for (const row of rows) {
      const group = groups.get(row.id) ?? [];
      group.push(row);
      groups.set(row.id, group);
    }
    return [...groups.values()];
  };
  return [
    ['category', payload.categories],
    ['tag', payload.tags],
    ['author', payload.authors],
  ].flatMap(([kind, rows]) =>
    groupById(rows).flatMap((group) => {
      const primary = group.find((row) => row.locale === 'uk') ?? group[0];
      const alternatives = [
        { hreflang: 'x-default', href: blogArchivePath(kind, primary.locale, primary.slug) },
        ...group.map((row) => ({ hreflang: LANGUAGE[row.locale], href: blogArchivePath(kind, row.locale, row.slug) })),
      ];
      return group.map((row) => ({
        loc: blogArchivePath(kind, row.locale, row.slug),
        ...(row.updatedAt ? { lastmod: new Date(Date.parse(row.updatedAt)).toISOString() } : {}),
        alternatives,
      }));
    }),
  );
};

/**
 * Абсолютними URL стають лише тут: усі джерела вище працюють у координатах сайту, і саме
 * тому хост у файлі завжди канонічний, а не той, з якого прийшов запит.
 */
export const buildSitemapXml = (siteUrl, entries) => {
  const absolute = (value) => `${siteUrl}${value.startsWith('/') ? '' : '/'}${value}`;
  const body = entries
    .map((entry) =>
      [
        '    <url>',
        `        <loc>${escapeXml(absolute(entry.loc))}</loc>`,
        ...(entry.lastmod ? [`        <lastmod>${escapeXml(entry.lastmod)}</lastmod>`] : []),
        // Кластер включає й саму сторінку: без `hreflang` на себе Google збирає набір як
        // неповний і позначає його «incomplete» у Search Console.
        ...entry.alternatives.map(
          (link) => `        <xhtml:link rel="alternate" hreflang="${escapeXml(link.hreflang)}" href="${escapeXml(absolute(link.href))}" />`,
        ),
        '    </url>',
      ].join('\n'),
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;
};
