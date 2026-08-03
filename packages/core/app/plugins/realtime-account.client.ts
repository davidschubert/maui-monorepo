import { accountVerifyDue } from '../../shared/realtimeGate'

/**
 * Live-Session-Widerruf (#9): Beendet ein Admin die Sessions eines Users (oder
 * der User meldet sich auf einem anderen Gerät komplett ab), feuert der
 * `account`-Channel ein Session-Delete-Event. Wir laden den Auth-State nach —
 * ist die EIGENE Session weg, sofortiger Force-Logout zur Login-Seite.
 *
 * Andere Sessions zu beenden lässt die eigene unangetastet → kein Logout.
 * Client-only, app-weit (detached EffectScope).
 *
 * NICHT AUF EINEM HOST, DEN ES NICHT GIBT (2026-08-03): dort antwortet jeder
 * Pfad 404, der Cookie-WS kann nie stehen, und das Nachprüfen unten wurde zum
 * Dauerläufer. Messung, Begründung und die Nachhol-Regel stehen in
 * `app/utils/hostGate.ts`.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const auth = useAuthStore()
  const localePath = useLocalePath()
  const toast = useToast()
  // useI18n() ist im Plugin-Setup nicht erlaubt → globale $i18n-Instanz nutzen
  const i18n = nuxtApp.$i18n as { t: (key: string) => string }
  const scope = effectScope(true)
  let timer: ReturnType<typeof setTimeout> | undefined
  // 0 = noch nie geprüft → der erste Abbruch prüft SOFORT (accountVerifyDue).
  let lastVerifyAt = 0

  // Auth nachprüfen (entprellt): ist die eigene Session weg → Force-Logout.
  // Läuft sowohl bei Account-Events als auch beim Schließen der Verbindung
  // (Revocation kappt den Socket, bevor ein Event ankommt).
  function verify() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      // Mindestabstand gegen Reconnect-Stürme (Regel + Begründung in
      // shared/realtimeGate.ts): ohne ihn ist JEDER Verbindungsabbruch ein
      // Doppel-Abruf — bei einem flappenden Socket dauerhaft und je Tab.
      const now = Date.now()
      if (!accountVerifyDue(lastVerifyAt, now)) return
      lastVerifyAt = now
      void nuxtApp.runWithContext(async () => {
        if (!auth.user) return
        await auth.refresh()
        if (auth.user) return // eigene Session lebt weiter (z.B. nur Netz-Blip)
        toast.add({
          title: i18n.t('auth.sessionRevoked'),
          description: i18n.t('auth.sessionRevokedDescription'),
          color: 'warning',
          icon: 'i-ph-sign-out',
        })
        await navigateTo(localePath('/login'))
      })
    }, 400)
  }

  startWhenHostResolves(nuxtApp, () => {
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
})
