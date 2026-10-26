import { CONSENT_STORAGE_KEY } from '~/composables/media-decisions.mjs'

/**
 * Дозвіл на мікрофон питеться на старті: діалог посеред затискання краде pointer-потік,
 * тож перший тап не записував нічого. Best-effort — iOS відхилить запит без жесту, і
 * тоді діалог показує саме затискання, але жест вже не ламається (`useVoiceRecorder`).
 * Виклик не awaited: дозвільний діалог не повинен тримати весь застосунок на «стартовому» екрані.
 */
const askForMediaConsent = async () => {
  if (localStorage.getItem(CONSENT_STORAGE_KEY)) return
  if (!navigator?.mediaDevices?.getUserMedia) return

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
}

export default defineNuxtPlugin(() => {
  const route = useRoute()
  // Дозвіл потрібен лише для запису в чаті — адмінці й сторінкам входу він не стосується.
  if (!route.path.startsWith('/admin') && !route.path.startsWith('/auth')) void askForMediaConsent()
})
