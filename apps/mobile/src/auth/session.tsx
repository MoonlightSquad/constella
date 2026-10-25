import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TRPCClientError } from '@trpc/client';

import { dropToken, readToken, saveToken } from '@/api/token-store';
import { trpc } from '@/api/trpc';
import { unregisterPushDevice } from '@/notifications/push';

export type Me = Awaited<ReturnType<typeof trpc.me.query>>;

type SessionStatus = 'loading' | 'anonymous' | 'authenticated' | 'offline';

type SessionValue = {
  status: SessionStatus;
  me: Me | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

const isUnauthorized = (error: unknown) =>
  error instanceof TRPCClientError && error.data?.httpStatus === 401;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    const token = await readToken();
    if (!token) {
      setMe(null);
      setStatus('anonymous');
      return;
    }
    try {
      setMe(await trpc.me.query());
      setStatus('authenticated');
    } catch (error) {
      setMe(null);
      if (isUnauthorized(error)) {
        await dropToken();
        setStatus('anonymous');
      } else {
        setStatus('offline');
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(
    async (token: string) => {
      await saveToken(token);
      try {
        setMe(await trpc.me.query());
        setStatus('authenticated');
      } catch (error) {
        setMe(null);
        if (isUnauthorized(error)) {
          await dropToken();
          setStatus('anonymous');
          throw error;
        }
        setStatus('offline');
        throw error;
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await unregisterPushDevice();
    await dropToken();
    setMe(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, me, signIn, signOut, refresh: load }),
    [status, me, signIn, signOut, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession() поза <SessionProvider>');
  return context;
}
