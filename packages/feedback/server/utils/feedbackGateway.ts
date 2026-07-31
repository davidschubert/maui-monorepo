import type { H3Event } from 'h3'
import type { FeedbackServicePath } from '../../../control/shared/customerFeedback'

/**
 * Die Naht zum Control Plane, aus Sicht einer RUNTIME-App.
 *
 * Davids Entscheidung 1 (docs/plans/CUSTOMER-FEEDBACK.md): „jedes Dashboard
 * fragt seinen EIGENEN Server, der über dieselbe Service-Naht bei control
 * nachfragt." Es gibt damit EINE Wahrheit, keine Spiegelzeile — bewusst in
 * Kauf genommen sind eine Proxy-Route je Operation, etwas Latenz und die
 * Tatsache, dass control zur Abhängigkeit aller Dashboards wird.
 *
 * ZWEI WEGE, EIN AUFRUF:
 *
 *  - **HTTP** (Regelfall): Secret + Appwrite-JWT über `callControlService`.
 *  - **In-Process**: apps/control IST das Control Plane. Ein Schleifen-Aufruf
 *    an sich selbst wäre eine zusätzliche Fehlerquelle für null Gewinn, also
 *    registriert der control-Layer hier eine lokale Umsetzung
 *    (`registerFeedbackBackend`, gleiches Vertragsmuster wie
 *    registerSiteJoinHandler/registerTenantResolver). Der feedback-Layer kennt
 *    control NICHT — er kennt nur diesen Haken.
 *
 * SAUBER DEGRADIEREN ist Teil der Entscheidung: antwortet control nicht, darf
 * der Feedback-Bereich nicht das ganze Dashboard mitreißen. Deshalb gibt es
 * `feedbackServiceReachable()` — die Leseseite fängt damit ab, statt eine
 * 503-Seite zu produzieren.
 */

export type FeedbackBackend = (
  event: H3Event,
  path: FeedbackServicePath,
  body: Record<string, unknown>,
) => Promise<unknown>

let localBackend: FeedbackBackend | null = null

/** Der control-Layer meldet sich als lokale Gegenseite an (Nitro-Plugin). */
export function registerFeedbackBackend(backend: FeedbackBackend): void {
  localBackend = backend
}

/** Läuft diese App SELBST auf dem Control Plane? */
export function hasLocalFeedbackBackend(): boolean {
  return localBackend !== null
}

/**
 * Betreiber-Operationen (Zustand verschieben, verstecken, Community
 * stummschalten) gibt es nur dort, wo das Control Plane selbst läuft. Über die
 * Naht wären sie garantiert 403 (`isOperator` ist dort fest false) — also
 * antwortet die Route hier 404: die Operation existiert an diesem Ort nicht.
 */
export function requireLocalFeedbackBackend(): void {
  if (!localBackend) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
}

export function feedbackServiceReachable(event: H3Event): boolean {
  return hasLocalFeedbackBackend() || controlServiceAvailable(event)
}

export async function callFeedbackService<T>(
  event: H3Event,
  path: FeedbackServicePath,
  body: Record<string, unknown>,
): Promise<T> {
  if (localBackend) return await localBackend(event, path, body) as T
  return await callControlService<T>(event, path, body)
}

/**
 * Der Umschlag, den JEDER Aufruf über die Naht trägt: „wer" (JWT) und „von
 * welchem Host" (communityId). Beides kommt aus dem SERVER-Kontext, nie aus
 * dem Body des Browsers — dieselbe Regel wie `tenantId` kommt nie vom
 * Aufrufer. Das Control Plane prüft danach ohnehin beides selbst nach.
 *
 * Ohne Session bleibt `jwt` weg. Das ist kein Versehen, sondern Entscheidung 4:
 * wer nicht eingeloggt ist, schreibt wirklich anonym.
 */
export async function feedbackEnvelope(event: H3Event): Promise<{ jwt?: string, communityId?: string }> {
  // In-Process braucht es kein JWT: die lokale Gegenseite liest die eigene
  // Session. Ein trotzdem geprägtes JWT wäre ein Appwrite-Roundtrip pro
  // Klick, den niemand liest.
  const jwt = localBackend ? undefined : await mintServiceJwtIfPossible(event)
  const tenant = useTenant(event)
  return {
    ...(jwt ? { jwt } : {}),
    ...(tenant?.communityId ? { communityId: tenant.communityId } : {}),
  }
}
