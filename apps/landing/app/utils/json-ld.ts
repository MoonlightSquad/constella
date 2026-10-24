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
