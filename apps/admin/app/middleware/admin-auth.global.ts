export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return;

  const { session, refresh } = useAdminSession();
  if (!session.value) await refresh();
  if (!session.value) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { next: to.fullPath } });
  }
});
