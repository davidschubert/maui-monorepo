import { COMMUNITY_SUSPENDED_CODE } from '../../shared/communitySuspension'
import { FETCH_ERROR_HOOK, type FetchErrorNotice } from '../../shared/fetchErrorBridge'

/**
 * DIE SPERRE ERREICHT DEN MENSCHEN (M13-Wechselwirkung, Befund 1).
 *
 * WAS FEHLTE: `tenantDb()` weist in einer billing-gesperrten Community jedes
 * Schreiben eines Mitglieds mit 403 und `data.code = COMMUNITY_SUSPENDED_CODE`
 * ab, der zentrale Fehler-Handler hebt den Schlüssel als `reason` ins Envelope —
 * und im Browser las ihn NIEMAND. Wer einen Beitrag abschickte, bekam den
 * generischen „hat nicht geklappt"-Toast seines Layers. Die Mahnung war damit
 * für genau die Leute unsichtbar, die sie am ehesten zum Owner tragen.
 *
 * WARUM HIER UND NICHT IN DEN FORMULAREN: durch die Datentür geht JEDER
 * Schreibvorgang eines Mandanten-Layers — Kommentare, Beiträge, Umfragen,
 * Zu-/Absagen, Kursfortschritt. Ein Satz in zwanzig `catch`-Zweigen wäre zwanzig
 * Stellen, an denen jemand ihn beim nächsten Formular vergisst; es ist derselbe
 * Grund, aus dem die Sperre selbst an der Tür hängt und nicht in den Routen.
 *
 * WIE DER HAKEN DORTHIN KOMMT: nicht von hier. `globalThis.$fetch` in einem
 * Plugin zu ersetzen, erreicht das auto-importierte `$fetch` der Komponenten
 * NICHT (Momentaufnahme, live nachgemessen) — der Interceptor sitzt deshalb in
 * Nuxts `fetch.mjs`, gesetzt vom `app:templates`-Hook in
 * `packages/core/nuxt.config.ts`. Begründung in `shared/fetchErrorBridge.ts`.
 * Dieses Plugin liefert nur den Leser, der Toasts und Sprachen kennt.
 *
 * DER GRUND BLEIBT DRAUSSEN: der Text sagt „vorübergehend schreibgeschützt" und
 * „die Verantwortlichen sind informiert", nie „Zahlungsverzug". Warum gesperrt
 * ist, verlangt `community.billing` (`GET /api/community/suspension` antwortet
 * einem Mitglied 403) — ein Toast darf diese Grenze nicht unterlaufen, nur weil
 * er dieselbe Tatsache erklärt.
 *
 * FESTE `id`: eine Liste mit mehreren Knöpfen (Stimmen, Zu-/Absagen) kann
 * mehrere Antworten kurz hintereinander produzieren. Nuxt UI ersetzt bei
 * gleicher id, statt zu stapeln.
 *
 * WAS DIESER HINWEIS NICHT KANN: den generischen Toast des Layers unterdrücken,
 * der im `catch` danach folgt — der Hinweis steht davor und beantwortet die
 * Frage, die der allgemeine offenlässt. Wer so eine Stelle ohnehin anfasst,
 * prüft `error.data.reason === COMMUNITY_SUSPENDED_CODE` und schweigt dann.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const target = globalThis as unknown as Record<string, unknown>
  target[FETCH_ERROR_HOOK] = (notice: FetchErrorNotice) => {
    if (notice.status !== 403 || notice.reason !== COMMUNITY_SUSPENDED_CODE) return
    nuxtApp.runWithContext(() => {
      // `nuxtApp.$i18n` statt useI18n(): der Haken läuft außerhalb jedes
      // Komponenten-Setups, useI18n() würde dort werfen.
      const { t } = nuxtApp.$i18n as { t: (key: string) => string }
      useToast().add({
        id: 'community-suspended',
        title: t('error.communitySuspended'),
        description: t('error.communitySuspendedHint'),
        color: 'warning',
        icon: 'i-ph-lock-simple',
      })
    })
  }
})
