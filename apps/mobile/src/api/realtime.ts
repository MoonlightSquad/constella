import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';

import { CHAT_WS_URL } from './config';
import { readToken } from './token-store';
import type { ChatMessage } from './types';

export type ChatFrame =
  | { type: 'chat.message'; message: ChatMessage }
  | { type: 'chat.typing' }
  // `messageIds` — batch із `chatMessages`/`markRead`; без нього ми б губили решту рядків.
  | { type: 'presence.read'; messageId: number; messageIds?: number[]; readAt: string }
  | { type: 'presence.delivered'; messageId: number; messageIds?: number[]; deliveredAt: string }
  | { type: 'error'; code: string; message: string };

export type OutgoingFrame =
  | { type: 'send.message'; body: string }
  | { type: 'send.typing' }
  | { type: 'send.read'; messageId: number }
  | { type: 'send.delivered'; messageId: number };

/**
 * Сервер закриває рукопотискення цими кодами (apps/api/src/index.ts:303-360), і жоден
 * ретрай їх не лікує: 4001 — невалідний `matchId`, 4002 — не учасник матчу,
 * 4003 — токен не пройшов перевірку.
 */
const TERMINAL_CLOSE: Record<number, TranslationKey> = {
  4001: 'chats.badRoom',
  4002: 'chats.noAccess',
  4003: 'chats.sessionExpired',
};

const BACKOFF = [1_000, 2_000, 4_000, 8_000, 15_000];

/**
 * WS-клієнт чату. Той самий handshake, що в `ConstellaDashboard.vue:603-662`:
 * `WebSocket` у React Native теж не вміє ставити заголовки на рукопотискення, тому
 * JWT іде рядком запиту. На відміну від вебу, де ретрай — рівний інтервал у 3 с,
 * тут експоненційна пауза, бо мобільний часто ловить сокет, який вмирає на кожному
 * кроці (перехід у фон, вимкнення Wi-Fi).
 */
export function useChatSocket(matchId: string | null, onFrame: (frame: ChatFrame) => void) {
  const { t } = useLocale();
  const [connected, setConnected] = useState(false);
  const [note, setNote] = useState('');
  const handler = useRef(onFrame);
  handler.current = onFrame;
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!matchId) return;
    const room: string = matchId;
    let disposed = false;
    let attempt = 0;
    let deadline: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      if (deadline) clearTimeout(deadline);
      deadline = null;
    };

    const schedule = () => {
      if (disposed || deadline) return;
      setConnected(false);
      setNote(t('dashboard.connecting'));
      deadline = setTimeout(open, Math.min(BACKOFF[Math.min(attempt, BACKOFF.length - 1)], 15_000));
      attempt += 1;
    };

    async function open() {
      if (disposed) return;
      clear();
      const token = await readToken();
      if (disposed) return;
      const params = new URLSearchParams({ matchId: room });
      if (token) params.set('token', token);
      const ws = new WebSocket(`${CHAT_WS_URL}/api/chat/ws?${params.toString()}`);
      socket.current = ws;
      ws.onopen = () => {
        if (disposed) return;
        attempt = 0;
        setConnected(true);
        setNote('');
      };
      ws.onmessage = (event) => {
        if (disposed || typeof event.data !== 'string') return;
        try {
          handler.current(JSON.parse(event.data) as ChatFrame);
        } catch {
          // Сервер не шле бінарних фреймів у чаті; сміття ігноруємо, як і веб.
        }
      };
      ws.onclose = (close) => {
        if (disposed) return;
        socket.current = null;
        const terminal = TERMINAL_CLOSE[close.code];
        if (terminal) {
          setNote(t(terminal));
          return;
        }
        schedule();
      };
      ws.onerror = () => {
        if (disposed) return;
        setConnected(false);
      };
    }

    void open();
    return () => {
      disposed = true;
      clear();
      socket.current?.close();
      socket.current = null;
    };
  }, [matchId, t]);

  const send = useCallback((frame: OutgoingFrame): boolean => {
    const ws = socket.current;
    if (!matchId || !ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ ...frame, matchId }));
    return true;
  }, [matchId]);

  return { connected, note, send };
}

export type ChatSocketHandle = ReturnType<typeof useChatSocket>;
