export type AdminPromptRequest = {
  title: string;
  label: string;
  kind?: 'text' | 'number' | 'textarea';
  value?: string;
  minLength?: number;
  maxLength?: number;
  hint?: string;
  danger?: boolean;
};

type PromptState = { open: boolean; request: AdminPromptRequest | null };

let settle: ((value: string | null) => void) | null = null;

/**
 * `window.prompt` was the whole input story of the old console: no validation, no styling, and a
 * value the caller had to re-check by hand. This keeps the one-line call site — the promise
 * resolves only with a value that already satisfies `minLength`/`maxLength`, or `null` for
 * "cancelled" — and puts the rules in the dialog instead of in every action.
 */
export const useAdminPrompt = () => {
  const state = useState<PromptState>('admin-prompt', () => ({ open: false, request: null }));

  const ask = (request: AdminPromptRequest) =>
    new Promise<string | null>((resolve) => {
      settle = resolve;
      state.value = { open: true, request };
    });

  const close = (value: string | null) => {
    state.value = { open: false, request: null };
    settle?.(value);
    settle = null;
  };

  return { state, ask, close };
};
