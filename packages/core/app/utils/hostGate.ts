import type { NuxtApp } from '#app'
import { isUnknownHostError } from '../../shared/unknownHost'

/**
 * ── STARTE NICHTS AUF EINER ADRESSE, DIE ES NICHT GIBT ──────────────────────
 *
 * Auf einem unbekannten oder `abuse`-gesperrten Host wirft `00.tenant.ts` für
 * JEDEN Pfad 404 — Seite wie API. Die Fehlerseite rendert trotzdem, und zwar
 * MIT hydriertem Auth-Store: Nuxt lässt für seinen internen
 * `/__nuxt_error`-Durchgang die Mandanten-Middleware passieren (C12b), also
 * läuft `02.auth.ts` und der Nutzer ist im Payload eingeloggt. Jedes Plugin,
 * das daran hängt, läuft damit los — gegen einen Host, der ihm garantiert 404
 * antwortet.
 *
 * Gemessen (2026-08-03, 60 s auf der 404-Seite eines abuse-gesperrten Hosts):
 * 66 WebSocket-Versuche, 15 API-Requests, 58 Konsolenzeilen „Realtime
 * disconnected". Der Motor war `realtime-account.client.ts`: sein Cookie-WS
 * kann dort nie stehen, und JEDER Verbindungsabbruch zog ein `auth.refresh()`
 * nach sich — `/api/auth/me` + `/api/community/role`, beide 404, im
 * Backoff-Takt 1,1 s · 2,2 · 4,2 · 8,2 · 16,3 · 31,3 · 46,3 s.
 *
 * WARUM `isUnknownHostError` UND NICHT `useError()` SCHLECHTHIN: ein 404 auf
 * einer TIPPFEHLER-URL einer gesunden Community ist etwas völlig anderes —
 * dort lebt der Host, die APIs antworten, und der Account-WS erfüllt seinen
 * Zweck (Sofort-Abmeldung bei Session-Widerruf). Ihn dort abzuschalten wäre
 * kein Sparen, sondern der Verlust eines Sicherheitssignals. Die Regel ist
 * bewusst dieselbe, die die Fehlerseite selbst benutzt, um ihren Satz zu
 * wählen (`CoreErrorPage`, shared/unknownHost.ts) — Seite und Verhalten
 * behaupten damit garantiert dasselbe.
 *
 * NACHGEHOLT, NICHT VERWORFEN: räumt `clearError()` den Fehler, startet das
 * Abonnement doch noch. Ein blosses `return` würde einen Tab, der EINMAL auf
 * einer 404 gelandet ist, für den Rest der Sitzung ohne Realtime lassen —
 * dieselbe Überlegung wie beim Presence-Heartbeat (Befund 3 des
 * M13-Wechselwirkungs-Audits, presence-heartbeat.client.ts).
 *
 * `runWithContext`: der nachgeholte Start läuft aus einem Watcher, also
 * ausserhalb des Plugin-Setups — ohne den Kontext fänden `useRuntimeConfig()`
 * & Co. keinen Nuxt-App-Zustand mehr.
 */
export function startWhenHostResolves(nuxtApp: NuxtApp, start: () => void): void {
  const error = useError()
  const run = () => { void nuxtApp.runWithContext(start) }

  if (!isUnknownHostError(error.value)) {
    run()
    return
  }

  const stop = watch(error, (current) => {
    if (isUnknownHostError(current)) return
    stop()
    run()
  })
}
