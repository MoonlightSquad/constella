export default eventHandler((event) => {
  const { siteUrl } = useRuntimeConfig(event).public;
  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=3600');
  return `User-agent: *
Disallow: /api/

Sitemap: ${siteUrl}/sitemap_index.xml
`;
});
