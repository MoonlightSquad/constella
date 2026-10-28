/**
 * The one shape every console section repeats: load, spinner, error text, reload after a
 * mutation. A 401 is not an error to display — the cookie died mid-work, and the honest
 * reaction is the login page with the current route as `next`.
 */
export const useConsoleQuery = <T>(loader: () => Promise<T>, options: { autoload?: boolean } = {}) => {
  const data = shallowRef<T | null>(null);
  const error = ref('');
  const pending = ref(false);

  const refresh = async () => {
    pending.value = true;
    error.value = '';
    try {
      data.value = await loader();
    } catch (cause: any) {
      const code = cause?.data?.code ?? cause?.code;
      const status = cause?.statusCode ?? cause?.status ?? cause?.data?.httpStatus;
      if (code === 'UNAUTHORIZED' || status === 401) {
        await navigateTo({ path: '/login', query: { next: useRoute().fullPath } });
        return null;
      }
      error.value = cause?.message || 'Не вдалося завантажити дані.';
      data.value = null;
    } finally {
      pending.value = false;
    }
    return data.value;
  };

  /** After a mutation: report the failure in the same place, and reload only if it worked. */
  const run = async (action: () => Promise<unknown>) => {
    error.value = '';
    try {
      await action();
    } catch (cause: any) {
      error.value = cause?.message || 'Дія не вдалася.';
      return false;
    }
    await refresh();
    return true;
  };

  if (options.autoload !== false) onMounted(refresh);

  return { data, error, pending, refresh, run };
};
