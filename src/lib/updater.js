import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

/** Widoczny stan aktualizacji — pokazujemy delikatny toast, zanim strona się przeładuje. */
export const updating = ref(false)

const CHECK_INTERVAL = 60 * 1000

export function initAutoUpdate() {
  if (!('serviceWorker' in navigator)) return

  // Czy strona była już kontrolowana przez SW? Jeśli nie, pierwsze przejęcie
  // (clientsClaim) nie jest aktualizacją i nie wolno przeładowywać.
  let hadController = !!navigator.serviceWorker.controller
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    if (reloading) return
    reloading = true
    updating.value = true
    window.location.reload()
  })

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const check = () => {
        if (navigator.onLine === false) return
        registration.update().catch(() => {})
      }

      setInterval(check, CHECK_INTERVAL)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) check()
      })
      window.addEventListener('online', check)
      window.addEventListener('focus', check)
    },
    onNeedRefresh() {
      // przy registerType: 'autoUpdate' zwykle się nie zdarza — zabezpieczenie
      updating.value = true
      updateSW(true)
    },
    onRegisterError(err) {
      console.warn('[planer] rejestracja service workera nie powiodła się', err)
    },
  })
}
