import { pastDueNoticeAvailable, runPastDueNoticeSweep } from '../../../utils/pastDueNotice'

/**
 * Zahlungswarnungen JETZT melden (Ops/Verifikation) — der Intervall-Plugin
 * läuft stündlich, diese Route erspart das Warten. Dasselbe Paar aus Plugin und
 * Handroute wie beim Digest-Sweep (`/api/notifications/run-digest`), und aus
 * demselben Grund: ein Lauf, den man nur durch Warten beobachten kann, ist einer,
 * der nie bewiesen wird.
 *
 * system.manage-gated (Betreiber). MANDANTENÜBERGREIFEND, und das ist die
 * dokumentierte Sweep-Ausnahme: der Lauf sieht alle überfälligen Communities
 * DIESES Runtime-Projekts, nicht die des Hosts, auf dem er ausgelöst wurde.
 *
 * WIEDERHOLT AUFRUFBAR ohne Schaden — der Idempotenz-Schlüssel jeder Meldung
 * lässt den zweiten Lauf ins Leere greifen (`notified: []`).
 *
 * 503 statt 404 ohne verdrahteten Leser: hier ist etwas FALSCH KONFIGURIERT
 * (Control-Env fehlt), nicht abwesend — der Unterschied entscheidet, ob jemand
 * danach sucht.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  if (!pastDueNoticeAvailable()) {
    throw createError({ status: 503, statusText: 'Control plane is not configured' })
  }
  return await runPastDueNoticeSweep()
})
