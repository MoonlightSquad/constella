import type { AdminSession } from '~/types/admin';

const CSRF_COOKIE = 'constella_csrf';

/**
 * The session token is invisible here on purpose (httpOnly, path /api/admin): every call
 * is authenticated by the cookie, and the only thing the page can prove is the CSRF echo.
 */
const csrfToken = () => {
  const entry = document.cookie.split('; ').find((candidate) => candidate.startsWith(`${CSRF_COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(CSRF_COOKIE.length + 1)) : '';
};

export class AdminRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const messageFor = (status: number, payload: unknown, statusMessage?: string) => {
  const fromUpstream = (payload as { error?: string; statusMessage?: string } | null)?.error || statusMessage;
  if (fromUpstream) return fromUpstream;
  if (status === 401) return 'Сесія адміністратора завершилась. Увійди знову.';
  if (status === 403) return 'Запит відхилено: перевірте CSRF-захист.';
  if (status === 409) return 'Такий slug уже існує в цій мові.';
  return `Помилка ${status || 'мережі'}.`;
};

const request = async <T>(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; query?: Record<string, unknown>; body?: unknown } = {}): Promise<T> => {
  const method = options.method ?? 'GET';
  try {
    return await $fetch<T>(path, {
      method,
      query: options.query,
      body: options.body,
      headers: method === 'GET' ? undefined : { 'x-csrf-token': csrfToken() },
    });
  } catch (error) {
    const status = Number((error as { statusCode?: number }).statusCode ?? 0);
    throw new AdminRequestError(status, messageFor(status, (error as { data?: unknown }).data, (error as { statusMessage?: string }).statusMessage));
  }
};

export const useAdminApi = () => ({
  get: <T>(path: string, query?: Record<string, unknown>) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
});

/**
 * One session per browser tab: the route middleware, the layout and the editor all need
 * to know who is signed in, and re-asking upstream on each of them would triple the 401s.
 */
export const useAdminSession = () => {
  const state = useState<AdminSession | null>('admin-session', () => null);
  const api = useAdminApi();

  const refresh = async () => {
    try {
      state.value = await api.get<AdminSession>('/api/admin/session');
    } catch (error) {
      if ((error as AdminRequestError).status !== 401) throw error;
      state.value = null;
    }
    return state.value;
  };

  const signIn = async (email: string, password: string) => {
    await api.post('/api/admin/login', { email, password });
    await refresh();
    return state.value;
  };

  const signOut = async () => {
    await api.post('/api/admin/logout', {});
    state.value = null;
  };

  return { session: state, refresh, signIn, signOut };
};
