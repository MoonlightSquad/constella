/**
 * A published post is readable on the marketing origin, never here — `/blog/<slug>` on the
 * console host is a 404. Empty `siteUrl` (a local run without the var) returns '' so the
 * link simply does not render instead of pointing at nothing.
 */
export const publicPostUrl = (locale: string, slug: string) => {
  const base = useRuntimeConfig().public.siteUrl.replace(/\/+$/, '');
  if (!base) return '';
  return `${base}${locale === 'uk' ? '' : `/${locale}`}/blog/${slug}`;
};
