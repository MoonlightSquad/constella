import { CONSENT_STORAGE_KEY, isTelegramWebview } from './media-decisions.mjs'

/**
 * Дозвіл на мікрофон питимо заздалегідь: діалог, який показує саме затискання кнопки
 * запису, забирає pointer-потік, і жест не виконується.
 *
 * У WebView Telegram це лише зайве вікно — там grant не зберігається і видається на
 * кожен `getUserMedia`, тому мікрофон один раз на кімнату відкриває `warmUp` у
 * `useVoiceRecorder`. Тут лишається звичайний браузер.
 *
 * Кешуємо лише `granted`: `denied` не вирок, iOS без жорсту відхиляє запит завжди.
 */
export const primeMediaConsent = () => {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(CONSENT_STORAGE_KEY) === 'granted') return
  if (isTelegramWebview(navigator.userAgent)) return
  if (!navigator?.mediaDevices?.getUserMedia) return

  void (async () => {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      if (status.state === 'granted') {
        localStorage.setItem(CONSENT_STORAGE_KEY, 'granted')
        return
      }
    } catch {
      // WebKit не розуміє імені `microphone` — переходимо одразу до прямого запиту.
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      localStorage.setItem(CONSENT_STORAGE_KEY, 'granted')
    } catch (error: any) {
      if (error?.name === 'NotAllowedError') localStorage.setItem(CONSENT_STORAGE_KEY, 'denied')
    }
  })()
}
