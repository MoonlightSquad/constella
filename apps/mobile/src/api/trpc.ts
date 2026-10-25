import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@constella/api';

import { API_BASE_URL } from './config';
import { readToken } from './token-store';

/**
 * Той самий vanilla-клієнт, що й у `apps/web/plugins/trpc.ts`: без react-query, бо
 * запити тут імперативні (перевірка паритету з веб-застосунком залишається дифом).
 * Сервер використовує дефолтний JSON-трансформер, тож `Date` приходять рядком.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_BASE_URL}/trpc`,
      headers: async () => {
        const token = await readToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
