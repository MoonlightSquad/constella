/**
 * BCP 47 tag per post locale — the same pairs `nuxt.config.ts` gives `@nuxtjs/i18n`,
 * which is what the module writes into `<xhtml:link hreflang>` for every page. Reusing
 * them keeps the database-driven blog entries and the HTML `hreflang` one signal, not two.
 */
export const LOCALE_LANGUAGE = { uk: 'uk-UA', en: 'en-US', de: 'de-DE', fr: 'fr-FR' } as const;
