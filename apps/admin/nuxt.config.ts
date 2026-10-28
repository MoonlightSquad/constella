// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

export default defineNuxtConfig({
  // The console is a private SPA: nothing here is worth crawling, and a server render
  // would have to resolve a session cookie it must not read on the edge anyway.
  ssr: false,
  compatibilityDate: '2025-06-01',

  app: {
    head: {
      title: 'Constella admin',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        { name: 'theme-color', content: '#0b1214' },
        // The route rules add the same header for no-JS crawlers, which get only a shell.
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
      ],
    },
  },

  css: ['~/assets/css/tokens.css', '~/assets/css/admin.css'],

  runtimeConfig: {
    // Server-side only. The browser talks to this origin's /api/**, never to the API
    // directly, so the single-origin production CORS allowlist never applies here.
    apiInternalBase: process.env.NUXT_API_INTERNAL_BASE || process.env.API_INTERNAL_URL || '',
    public: {
      // Blog readers live on the marketing origin; the console only needs it to build
      // "open on site" links, so an unset value hides those links instead of 404-ing.
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
    },
  },

  routeRules: {
    // The console chrome is every screen's layout; /login overrides it with `blank` in page meta.
    '/**': { appLayout: 'admin', headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  },

  vite: {
    server: { allowedHosts: true },
  },
});
