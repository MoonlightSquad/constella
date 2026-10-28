const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://constella.pp.ua';

export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: '2025-06-01',

  modules: ['@nuxtjs/i18n', '@nuxtjs/sitemap'],

  app: {
    head: {
      // A function here would not survive the config serialization boundary;
      // each page sets its own full title through useSeoMeta().
      title: 'Constella — знайомства за сузір’ям інтересів',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        { name: 'theme-color', content: '#0d1718' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/favicon-64.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        // Latin is needed on every locale (brand name, numbers, "VIP", "FAQ").
        // The Cyrillic subset is preloaded per locale from app.vue instead, so
        // de/en/fr visitors do not pay 14 KB for glyphs they will not render.
        { rel: 'preload', href: '/fonts/manrope-latin.woff2', as: 'font', type: 'font/woff2', crossorigin: 'anonymous' },
      ],
    },
  },

  css: ['~/assets/css/tokens.css', '~/assets/css/landing.css'],

  runtimeConfig: {
    // Server-side only: the browser never talks to the API directly, so the
    // production CORS allowlist (single origin) never applies to landing data.
    apiInternalBase: process.env.NUXT_API_INTERNAL_BASE || process.env.API_INTERNAL_URL || '',
    public: {
      siteUrl,
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'https://app-test.constella.pp.ua',
      telegramBotUsername: process.env.NUXT_PUBLIC_BOT_USERNAME || process.env.BOT_USERNAME || '',
    },
  },

  site: { url: siteUrl, index: true },

  i18n: {
    defaultLocale: 'uk',
    strategy: 'prefix_except_default',
    // No server redirect from '/' and no cookie sniffing: '/' is Ukrainian and
    // a redirect would serve Google a different language than it crawls.
    detectBrowserLanguage: false,
    baseUrl: siteUrl,
    locales: [
      { code: 'uk', language: 'uk-UA', file: 'uk.json', name: 'Українська' },
      { code: 'en', language: 'en-US', file: 'en.json', name: 'English' },
      { code: 'de', language: 'de-DE', file: 'de.json', name: 'Deutsch' },
      { code: 'fr', language: 'fr-FR', file: 'fr.json', name: 'Français' },
    ],
  },

  sitemap: {
    autoLastmod: false,
    // Published posts live in the database, so their URLs are a source, not pages.
    sources: ['/api/__sitemap__/blog-urls'],
  },

  routeRules: {
    '/': { prerender: true },
    '/en': { prerender: true },
    '/de': { prerender: true },
    '/fr': { prerender: true },
    '/legal/**': { prerender: true },
    // ISR on Vercel; ignored by the node server preset, where it is plain SSR.
    '/blog': { isr: 60 },
    '/blog/**': { isr: 60 },
    '/feed/**': { isr: 600 },
    '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/fonts/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/en', '/de', '/fr'],
      // Blog URLs come from the database, so the crawler must not stop on them:
      // they are rendered on demand and served through ISR instead. The feed is
      // linked from every blog page, and a build-time snapshot would freeze it.
      ignore: ['/blog', '/blog/**', '/feed/**'],
    },
  },

  vite: {
    server: { allowedHosts: true },
  },
});
