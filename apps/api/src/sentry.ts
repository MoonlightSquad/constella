import * as Sentry from '@sentry/node';

/**
 * Sentry optional-by-design: без реального DSN SDK лишається вимкненим, тому
 * локальні запуски та CI з плейсхолдерами (`constella.deploy.config.*.json`) не
 * пишуть у неіснуючий проєкт. DSN підхоплюється з root `.env` (SENTRY_DSN).
 */
let enabled = false;

const looksLikePlaceholder = (dsn: string) => dsn.includes('PUBLIC_KEY') || dsn.includes('public_key');

export const initSentry = () => {
  const dsn = (process.env.SENTRY_DSN ?? '').trim();
  if (!dsn || looksLikePlaceholder(dsn)) return false;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    // Лише відлов помилок: трейсинг вимкнено, щоб не платити за обсяг подій.
    tracesSampleRate: 0,
    // v11 збирає 5xx-помилки Fastify через diagnostics_channel без окремого хука.
    integrations: [Sentry.fastifyIntegration()],
  });
  enabled = true;
  return true;
};

export const isSentryEnabled = () => enabled;

/** Manual capture for errors that never reach the Fastify error channel (tRPC). */
export const captureServerError = (
  error: unknown,
  context: { path?: string; requestId?: string; userId?: string } = {},
) => {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('request.id', context.requestId);
    if (context.path) scope.setContext('route', { path: context.path });
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
};

/** Best-effort flush before the process exits or the container freezes. */
export const closeSentry = async () => {
  if (!enabled) return;
  try {
    await Sentry.close(2000);
  } catch {
    // shutdown must never fail because of telemetry
  }
};
