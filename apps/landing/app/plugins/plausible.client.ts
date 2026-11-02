declare global {
  interface Window {
    plausible?: (event: string, options?: Record<string, unknown>) => void;
  }
}

/**
 * Plausible is opt-in per deployment: without a domain nothing is injected, so a missing
 * variable is a silent no-op instead of a request to a host we do not own.
 */
export default defineNuxtPlugin(() => {
  const { plausibleDomain, plausibleHost } = useRuntimeConfig().public;
  if (!plausibleDomain) return;

  const script = document.createElement('script');
  script.defer = true;
  // The outbound-links build already counts clicks to foreign domains, which is exactly
  // the funnel jump; a hand-written listener would report every one of them twice.
  script.src = `${plausibleHost.replace(/\/+$/, '')}/js/plausible.outbound-links.js`;
  script.setAttribute('data-domain', plausibleDomain);
  document.head.appendChild(script);

  // In-app navigation never reloads the page, so a blog-to-blog jump has to announce itself.
  useRouter().afterEach((to) => {
    window.plausible?.('Pageview', { u: to.fullPath });
  });
});
