/**
 * `<` is escaped because the payload is injected into a `<script>` element: a title
 * containing "</script>" would otherwise close the tag and turn prose into markup.
 */
export const useJsonLd = (build: () => Record<string, unknown> | null) => {
  useHead(() => {
    const value = build();
    if (!value) return {};
    return { script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(value).replace(/</g, '\\u003c') }] };
  });
};

export type Crumb = { name: string; path?: string };

/**
 * The last crumb is the page itself, so it carries no `item`: Google requires it on every
 * other entry and forbids it on the current one, whose `@id` already belongs to the
 * BlogPosting or CollectionPage emitted next to this graph.
 */
export const useBreadcrumbList = (crumbs: () => Crumb[]) => {
  const { siteUrl } = useRuntimeConfig().public;
  useJsonLd(() => {
    const list = crumbs();
    if (list.length < 2) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: list.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        ...(index === list.length - 1 || !crumb.path ? {} : { item: `${siteUrl}${crumb.path}` }),
      })),
    };
  });
};
