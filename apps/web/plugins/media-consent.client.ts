import { primeMediaConsent } from '~/composables/useMediaConsent'

export default defineNuxtPlugin(() => {
  const route = useRoute()
  // Дозвіл потрібен лише для запису в чаті — сторінкам входу він не стосується.
  if (!route.path.startsWith('/auth')) primeMediaConsent()
})
