import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TRPCClientError } from '@trpc/client';

import { trpc } from '@/api/trpc';
import { useLocale } from '@/i18n/locale-provider';

type MatchItem = Awaited<ReturnType<typeof trpc.social.matches.query>>[number];
type BillingStatus = Awaited<ReturnType<typeof trpc.billing.status.query>>;
type QuestsData = Awaited<ReturnType<typeof trpc.social.quests.query>>;
type IncomingLikes = Awaited<ReturnType<typeof trpc.social.incomingLikes.query>>;

const messageFrom = (error: unknown, fallback: string) =>
  error instanceof TRPCClientError && error.message ? error.message : fallback;

type DashboardValue = {
  matches: MatchItem[];
  sparks: number;
  incoming: IncomingLikes | null;
  billing: BillingStatus | null;
  quests: QuestsData | null;
  unread: number;
  loading: boolean;
  issue: string;
  loadMatches: () => Promise<void>;
  loadSparks: () => Promise<void>;
  loadBilling: () => Promise<void>;
  loadQuests: () => Promise<void>;
  completeInvite: () => Promise<void>;
  likeBack: (profileId: string) => Promise<boolean>;
  refreshAll: () => Promise<void>;
};

const DashboardContext = createContext<DashboardValue | null>(null);

/**
 * Спільний стан для чотирьох табів — той самий `refreshAll()`, що в
 * `ConstellaDashboard.vue:246`, тільки у вигляді context, бо в експозі кожен таб
 * це окремий екран і не може ділитися `ref`-ами з сусідом.
 */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [sparks, setSparks] = useState(0);
  const [incoming, setIncoming] = useState<IncomingLikes | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [quests, setQuests] = useState<QuestsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState('');

  const loadMatches = useCallback(async () => {
    try {
      setMatches(await trpc.social.matches.query());
    } catch (error) {
      setIssue(messageFrom(error, t('dashboard.loadError')));
    }
  }, [t]);

  const loadSparks = useCallback(async () => {
    try {
      // Лічильник і список «хто вподобав» оновлюються разом: обидва живуть на табі Sparks.
      const [result, likes] = await Promise.all([
        trpc.social.incomingSparks.query(),
        trpc.social.incomingLikes.query(),
      ]);
      setSparks(result.count);
      setIncoming(likes);
    } catch (error) {
      setIssue(messageFrom(error, t('dashboard.loadError')));
    }
  }, [t]);

  const loadBilling = useCallback(async () => {
    try {
      setBilling(await trpc.billing.status.query());
    } catch (error) {
      setIssue(messageFrom(error, t('dashboard.loadError')));
    }
  }, [t]);

  const loadQuests = useCallback(async () => {
    try {
      setQuests(await trpc.social.quests.query());
    } catch (error) {
      setIssue(messageFrom(error, t('dashboard.loadError')));
    }
  }, [t]);

  // Квест «запроси друга» рахує сам факт шарингу, як і у вебній версії.
  const completeInvite = useCallback(async () => {
    try {
      await trpc.social.completeInviteQuest.mutate();
      setQuests(await trpc.social.quests.query());
    } catch (error) {
      setIssue(messageFrom(error, t('dashboard.loadError')));
    }
  }, [t]);

  // «Хто вподобав тебе» — бекенд віддає заблюрені картки без VIP; взаємний лайк
  // створює міч, тому екран сам вирішує, куди вести користувача.
  const likeBack = useCallback(async (profileId: string) => {
    try {
      const result = await trpc.social.swipe.mutate({ profileId, kind: 'spark' });
      await Promise.all([loadMatches(), loadSparks()]);
      return result.matched;
    } catch (error) {
      setIssue(messageFrom(error, t('dashboard.loadError')));
      return false;
    }
  }, [loadMatches, loadSparks, t]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setIssue('');
    // Усі запити незалежні: один вмерлий роутер не повинен обсичувати бейджі
    // чатів і VIP-панель, тому allSettled, а не all.
    const results = await Promise.allSettled([
      trpc.social.matches.query(),
      trpc.social.incomingSparks.query(),
      trpc.billing.status.query(),
      trpc.social.quests.query(),
      trpc.social.incomingLikes.query(),
    ]);
    if (results[0].status === 'fulfilled') setMatches(results[0].value);
    if (results[1].status === 'fulfilled') setSparks(results[1].value.count);
    if (results[2].status === 'fulfilled') setBilling(results[2].value);
    if (results[3].status === 'fulfilled') setQuests(results[3].value);
    if (results[4].status === 'fulfilled') setIncoming(results[4].value);
    const failed = results.find((entry) => entry.status === 'rejected');
    if (failed && failed.status === 'rejected') setIssue(messageFrom(failed.reason, t('dashboard.loadError')));
    setLoading(false);
  }, [t]);

  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void refreshAll();
  }, [refreshAll]);

  const value = useMemo<DashboardValue>(
    () => ({
      matches,
      sparks,
      incoming,
      billing,
      quests,
      unread: matches.reduce((total, match) => total + match.unread, 0),
      loading,
      issue,
      loadMatches,
      loadSparks,
      loadBilling,
      loadQuests,
      completeInvite,
      likeBack,
      refreshAll,
    }),
    [matches, sparks, incoming, billing, quests, loading, issue, loadMatches, loadSparks, loadBilling, loadQuests, completeInvite, likeBack, refreshAll],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error('useDashboard() поза <DashboardProvider>');
  return context;
}
