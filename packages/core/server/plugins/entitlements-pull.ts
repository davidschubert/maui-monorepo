import { runEntitlementsPull } from '../utils/entitlementsPull'

/**
 * Entitlement-Pull-Intervall (F3/M8-Vorbereitung): Die Site MUSS ihr
 * signiertes Dokument mindestens alle 15 min pullen (Strategie § F3 —
 * Push/Realtime wäre nur Beschleunigung, nie der einzige Kanal). Ohne
 * NUXT_ENTITLEMENTS_URL sofortiger no-op (Klasse-A-Sites ohne Zustellung
 * laufen unverändert; die Gates bleiben neutral). Gleiches Muster wie
 * Digest-/Health-Sweep: setInterval + Erst-Lauf, Single-Instanz-Annahme;
 * manuell auslösbar über POST /api/platform/entitlements/refresh.
 */
const PULL_INTERVAL_MS = 15 * 60 * 1000
const FIRST_RUN_DELAY_MS = 10 * 1000

export default defineNitroPlugin(() => {
  if (!useRuntimeConfig().entitlementsUrl) return

  const pull = () => {
    void runEntitlementsPull().then((result) => {
      if (result.status === 'updated') {
        console.info(`[core] Entitlements aktualisiert — ${result.detail}`)
      }
      else if (result.status === 'error') {
        console.error(`[core] Entitlement-Pull fehlgeschlagen: ${result.detail} (last-known-good bleibt aktiv)`)
      }
    })
  }

  const firstRun = setTimeout(pull, FIRST_RUN_DELAY_MS)
  const timer = setInterval(pull, PULL_INTERVAL_MS)
  firstRun.unref?.()
  timer.unref?.()
})
