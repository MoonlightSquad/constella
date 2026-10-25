import { API_BASE_URL } from './config';
import { readToken } from './token-store';
import type { TranslationKey } from '@/i18n/messages';

export type AuthTokens = { token: string; userId: string };

/**
 * Помилка автентифікації несе ключ словника, а не рядок із сервера: серверні
 * повідомлення англомовні, а застосунок показує 4 мови. `serverMessage` лишаємо
 * лише для логування.
 *
 * Поведінку живого API перевірено 2026-10-24:
 * - запит без `Origin` і з чужим `Origin` обробляється однаково (CORS — правило
 *   браузера, а `fetch` у RN `Origin` не надсилає), тож розширювати серверний
 *   allowlist не потрібно;
 * - неуспішний вхід → `401 { error }` без поля `code`;
 * - непідтверджений email → `403 { code: 'EMAIL_NOT_VERIFIED' }`;
 * - реєстрація → `201 { emailVerificationRequired: true }` без токена;
 * - вхід → `200 { token, userId }`.
 */
export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly messageKey: TranslationKey,
    readonly serverMessage: string | null,
  ) {
    super(serverMessage ?? messageKey);
    this.name = 'AuthApiError';
  }
}

const keyForStatus = (status: number, code: string | null, fallback: TranslationKey): TranslationKey => {
  if (code === 'EMAIL_NOT_VERIFIED') return 'auth.verifyFirst';
  if (status === 401) return 'auth.loginError';
  if (status === 403) return 'auth.genericError';
  if (status === 409) return 'auth.emailExists';
  if (status === 429) return 'auth.rateLimited';
  if (status === 503) return 'app.apiOffline';
  return fallback;
};

async function post<T>(path: string, body: unknown, fallback: TranslationKey): Promise<T> {
  let response: Response;
  // Публічні роути ігнорують заголовок, а `/auth/account/delete` без нього 401-ить.
  const token = await readToken();
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    // Мережа впала — відповіді взагалі немає.
    throw new AuthApiError(0, null, 'app.apiOffline', null);
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; code?: string }
    | null;

  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      payload?.code ?? null,
      keyForStatus(response.status, payload?.code ?? null, fallback),
      payload?.error ?? null,
    );
  }
  return (payload ?? {}) as T;
}

export const registerWeb = (input: {
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: true;
}) => post<{ emailVerificationRequired?: boolean }>('/auth/web/register', input, 'auth.registerError');

export const loginWeb = (input: { email: string; password: string }) =>
  post<AuthTokens>('/auth/web/login', input, 'auth.loginError');

export const resendVerification = (email: string) =>
  post<{ ok: true }>('/auth/web/verification/resend', { email }, 'auth.verificationSent');

export const completeVerification = (token: string) =>
  post<{ ok: true }>('/auth/web/verification/complete', { token }, 'auth.actionExpired');

export const requestPasswordReset = (email: string) =>
  post<{ ok: true }>('/auth/web/password-reset/request', { email }, 'auth.resetSent');

export const completePasswordReset = (input: {
  token: string;
  password: string;
  confirmPassword: string;
}) => post<{ ok: true }>('/auth/web/password-reset/complete', input, 'auth.actionExpired');

/** Сервер вимагає `confirm: 'DELETE'` і пароль для web-акаунтів (`index.ts:867`). */
export const deleteAccount = (password: string) =>
  post<{ ok: true }>('/auth/account/delete', { confirm: 'DELETE', password }, 'auth.genericError');
