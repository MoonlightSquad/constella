const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

export const escapeXml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);

/** `/blog` is Ukrainian and unprefixed; the other three carry their prefix (strategy: prefix_except_default). */
export const blogIndexPath = (locale) => (locale === 'uk' ? '/blog' : `/${locale}/blog`);

export const blogPath = (locale, slug) => `${blogIndexPath(locale)}/${slug}`;

/**
 * RSS 2.0, deliberately short: the channel carries what the reader shows before the
 * first item, everything else (author, date, link) belongs to the item.
 */
export const buildRss = ({ locale, language, siteUrl, title, description, items }) => {
  const link = `${siteUrl}${blogIndexPath(locale)}`;
  const body = items
    .map((item) => {
      const url = `${link}/${item.slug}`;
      return [
        '    <item>',
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <dc:creator>${escapeXml(item.authorName)}</dc:creator>`,
        item.publishedAt ? `      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>` : '',
        `      <description>${escapeXml(item.excerpt)}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <language>${escapeXml(language)}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${siteUrl}/feed/${locale}.xml`)}" rel="self" type="application/rss+xml"/>
${body}
  </channel>
</rss>
`;
};
