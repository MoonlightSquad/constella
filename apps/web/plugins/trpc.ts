import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@constella/api';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const apiBase = (config.public.apiBase || '/api').replace(/\/+$/, '');

  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiBase}/trpc`,
        headers: () => {
          const token = localStorage.getItem('constella_token');
          return token ? { Authorization: `Bearer ${token}` } : {};
        }
      })
    ]
  });

  return {
    provide: {
      trpc
    }
  };
});