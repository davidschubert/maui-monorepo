/**
 * Live-Session-Widerruf (#9): Beendet ein Admin die Sessions eines Users (oder
 * der User meldet sich auf einem anderen Gerät komplett ab), feuert der
 * `account`-Channel ein Session-Delete-Event. Wir laden den Auth-State nach —
 * ist die EIGENE Session weg, sofortiger Force-Logout zur Login-Seite.
 *
 * Andere Sessions zu beenden lässt die eigene unangetastet → kein Logout.
 * Client-only, app-weit (detached EffectScope).
 */
export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore()
  const localePath = useLocalePath()
  const toast = useToast()
  // useI18n() ist im Plugin-Setup nicht erlaubt → globale $i18n-Instanz nutzen
  const i18n = nuxtApp.$i18n as { t: (key: string) => string }
  const scope = effectScope(true)
  let timer: ReturnType<typeof setTimeout> | undefined

  // Auth nachprüfen (entprellt): ist die eigene Session weg → Force-Logout.
  // Läuft sowohl bei Account-Events als auch beim Schließen der Verbindung
  // (Revocation kappt den Socket, bevor ein Event ankommt).
  function verify() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void nuxtApp.runWithContext(async () => {
        if (!auth.user) return
        await auth.refresh()
        if (auth.user) return // eigene Session lebt weiter (z.B. nur Netz-Blip)
        toast.add({ title: i18n.t('auth.sessionRevoked'), color: 'warning', icon: 'i-ph-sign-out' })
        await navigateTo(localePath('/login'))
      })
    }, 400)
  }

  scope.run(() => {
    // Nur für eingeloggte User verbinden — für Gäste hätte der account-Channel
    // nichts zu melden und der Reconnect-Loop liefe ins Leere. Bei Logout
    // schließen, bei Login (auch späterem) öffnen.
    let stop: (() => void) | undefined
    watch(() => auth.user?.$id, (id) => {
      if (id && !stop) {
        stop = useRealtimeAccount(() => verify(), { onClose: () => verify() })
      }
      else if (!id && stop) {
        stop()
        stop = undefined
      }
    }, { immediate: true })
  })
})
