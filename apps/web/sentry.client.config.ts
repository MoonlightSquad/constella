import * as Sentry from '@sentry/nuxt';

// Module entry: runs before the app bootstraps. Empty DSN keeps the SDK fully
// disabled (local dev, previews without monitoring config).
const runtimeConfig = useRuntimeConfig();
const dsn = String(runtimeConfig.public.sentry.dsn || '');

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: String(runtimeConfig.public.sentry.environment || '') || undefined,
  // Тільки помилки: product analytics/trace не замовляли.
  tracesSampleRate: 0,
  // 401/403 з tRPC-шару — це нормальний потік (сесія сіла), не баг.
  ignoreErrors: [/Session is no longer valid/, /Not authenticated/i],
});
