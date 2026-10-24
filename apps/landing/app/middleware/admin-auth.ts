export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/admin') || to.path === '/admin/login') return;

  const { session, refresh } = useAdminSession();
  if (!session.value) await refresh();
  if (!session.value) {
    return navigateTo({ path: '/admin/login', query: to.fullPath === '/admin' ? {} : { next: to.fullPath } });
  }
});
