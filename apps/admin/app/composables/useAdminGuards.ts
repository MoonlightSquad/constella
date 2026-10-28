import { onBeforeRouteLeave } from 'vue-router';

/** ⌘S / Ctrl+S in the editor: the keyboard path has to be as short as the button. */
export const useSaveHotkey = (handler: () => void) => {
  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      handler();
    }
  };
  onMounted(() => window.addEventListener('keydown', onKey));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
};

/**
 * Nothing in the console autosaves, so leaving would silently drop a draft: the browser
 * guard covers a closed tab and the router guard covers an in-app click.
 * `allowLeave` is for the one navigation that is not a loss — after a successful save the
 * editor jumps to the new post, and a confirm() there would block the route change.
 */
export const useUnsavedGuard = (isDirty: () => boolean) => {
  let leaving = false;
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (leaving || !isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));
  onBeforeRouteLeave(() => {
    if (leaving || !isDirty()) return true;
    return window.confirm('Є незбережені зміни. Вийти все одно?');
  });
  return { allowLeave: () => (leaving = true) };
};
