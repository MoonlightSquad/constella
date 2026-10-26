import * as Sentry from '@sentry/nuxt';

// Навіть з ssr:false нітро-сервер живий: він тримає /api/* проксі до API,
// і збої апстриму теж хочеться бачити. Окремий server-DSN опційний
// (NUXT_SENTRY_SERVER_DSN), інакше використовуємо той самий фронтенд-проєкт.
const runtimeConfig = useRuntimeConfig();
const dsn = String(runtimeConfig.sentryServerDsn || runtimeConfig.public.sentry.dsn || '');

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: String(runtimeConfig.public.sentry.environment || '') || undefined,
  tracesSampleRate: 0,
});
