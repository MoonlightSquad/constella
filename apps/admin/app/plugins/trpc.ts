import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@constella/api';

/**
 * No Authorization header here, unlike apps/web: the session lives in an httpOnly cookie on
 * /api, and `server/api/trpc/[...path].ts` is the only thing allowed to turn it into a bearer
 * token. A console that could read its own token would be a console whose token any page script
 * could read too.
 *
 * The double-submit value is a header, not a cookie the server can compare blindly: the proxy
 * refuses every write without it, so a mutation from this client is impossible without it.
 */
export default defineNuxtPlugin(() => {
  const trpc = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: '/api/trpc', headers: () => ({ 'x-csrf-token': csrfToken() }) })],
  });

  return { provide: { trpc } };
});
