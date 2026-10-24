export const useInstallModal = () => {
  const open = useState<boolean>('landing-install-open', () => false);
  return {
    open,
    show: () => { open.value = true; },
    hide: () => { open.value = false; },
  };
};
