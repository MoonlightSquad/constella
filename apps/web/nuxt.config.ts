// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import { resolveApiInternalBase } from './server/utils/api-proxy-target.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2024-04-03',
  modules: ['@nuxtjs/tailwindcss', '@sentry/nuxt/module'],

  watch: ['../../.env'],

  app: {
    head: {
      title: 'Constella',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }
      ],
      script: [
        { src: 'https://telegram.org/js/telegram-web-app.js' }
      ]
    }
  },

  runtimeConfig: {
    apiInternalBase: resolveApiInternalBase(process.env),
    // Sentry-конфіги зчитують ці значення (див. sentry.client/server.config.ts).
    sentryServerDsn: process.env.NUXT_SENTRY_SERVER_DSN || '',
    public: {
      // Browser-facing API base: same-origin "/api" proxy by default; set
      // NUXT_PUBLIC_API_URL to call the API origin directly (CORS is open).
      apiBase: (process.env.NUXT_PUBLIC_API_URL || '/api').replace(/\/+$/, ''),
      telegramBotUsername: process.env.NUXT_PUBLIC_BOT_USERNAME || process.env.BOT_USERNAME || '',
      sentry: {
        dsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
        environment: process.env.SENTRY_ENVIRONMENT || '',
      },
    }
  },

  vite: {
    server: {
      allowedHosts: true
    }
  }
})