import { setAdminSession, upstreamBase } from '../../utils/admin-api';

/**
 * Credentials go to the API and the JWT comes back into an httpOnly cookie — the token
 * itself never reaches the browser. Upstream allows 5 attempts per minute, and because the
 * proxy is the client, that budget is shared by every admin signing in.
 */
export default eventHandler(async (event) => {
  const body = await readBody<Record<string, unknown> | null>(event);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || email.length > 254 || !password || password.length > 1024) {
    throw createError({ statusCode: 400, statusMessage: 'Потрібні email і пароль.' });
  }

  const response = await fetch(new URL('/auth/admin/login', `${upstreamBase(event)}/`), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const text = await response.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw createError({ statusCode: response.status, statusMessage: String(data?.error ?? 'Вхід не вдався.') });
  }

  const token = typeof data?.token === 'string' ? data.token : '';
  if (!token) throw createError({ statusCode: 502, statusMessage: 'Логін не повернув сесію.' });
  setAdminSession(event, token);
  return { ok: true };
});
