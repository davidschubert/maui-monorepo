/**
 * DIE FACHLICHEN ABLEHNUNGSGRÜNDE DES MELDEWEGS — an EINER Stelle.
 *
 * Moderations-Audit Befund 3 (2026-08-01): eine doppelte Meldung beantwortete
 * die Route mit `200 { alreadyReported: true }`, während die Konsumenten auf
 * `409` verzweigten. Beide Seiten waren für sich plausibel, zusammen ergaben
 * sie einen toten Zweig — und einen Nutzer, dem „Meldung eingegangen" gesagt
 * wurde für etwas, das nicht angelegt wurde (dieselbe Klasse wie der alte
 * `last_admin`-Fall).
 *
 * EINE WAHRHEIT, und zwar die, die im Repo schon etabliert ist: die Route wirft
 * `createError({ status, data: { code } })`, der zentrale Handler
 * (core/server/error.ts) hebt genau diesen Schlüssel als `reason` ins Envelope,
 * der Client liest `error.data.reason`. Kein zweiter Kanal über ein
 * Erfolgs-Feld.
 *
 * PURE, damit Server (die Codes), Client (die Reaktion) und Test (der Beweis)
 * dieselben Strings benutzen und ein Tippfehler nicht still zu „unbekannter
 * Fehler" wird.
 */

/** Diese Meldung gibt es schon (Unique-Index reporter_target) — 409. */
export const ALREADY_REPORTED_CODE = 'already_reported'
/** Dieser Ziel-Typ ist hier nicht meldbar (nicht registriert) — 400. */
export const UNKNOWN_TARGET_CODE = 'unknown_target'
/** Das Ziel gibt es (in diesem Mandanten) nicht — 404. */
export const TARGET_NOT_FOUND_CODE = 'target_not_found'

export const REPORT_ERROR_CODES = [
  ALREADY_REPORTED_CODE,
  UNKNOWN_TARGET_CODE,
  TARGET_NOT_FOUND_CODE,
] as const

export type ReportErrorCode = (typeof REPORT_ERROR_CODES)[number]

/**
 * Den fachlichen Grund aus einem `$fetch`-Fehler lesen (`error.data.reason`).
 * Gibt `null` zurück, wenn keiner mitkam — dann ist es ein gewöhnlicher
 * Fehlschlag und der Aufrufer sagt genau das.
 */
export function reportErrorReason(error: unknown): ReportErrorCode | null {
  const reason = (error as { data?: { reason?: unknown } })?.data?.reason
  return typeof reason === 'string' && (REPORT_ERROR_CODES as readonly string[]).includes(reason)
    ? reason as ReportErrorCode
    : null
}
