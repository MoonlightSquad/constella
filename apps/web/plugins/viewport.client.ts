/**
 * `--app-h` тримає реальну висоту видимого поля. Вбудований браузер Telegram на iOS не
 * змінює висоту layout-в'юпорта, коли виїжджає клавіатура, тож `100svh` продовжує
 * включати площу під нею — і прилиплений інпут чату ховається за клавіатурою.
 */
export default defineNuxtPlugin(() => {
  const apply = () => {
    const height = window.visualViewport?.height ?? window.innerHeight
    document.documentElement.style.setProperty('--app-h', `${Math.round(height)}px`)
  }
  apply()
  window.visualViewport?.addEventListener('resize', apply)
  window.visualViewport?.addEventListener('scroll', apply)
  window.addEventListener('resize', apply)
})
