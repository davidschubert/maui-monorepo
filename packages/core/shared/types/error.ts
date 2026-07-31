/**
 * Stabiles Fehler-Vertragsformat für die API — gedacht für externe/embeddable
 * Konsumenten, die gegen feste Codes statt HTTP-Status-Raterei programmieren.
 * Greift NUR für `/api/`-Fehler-Responses (siehe server/plugins/error-envelope).
 */
export type PukalaniErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export interface PukalaniErrorResponse {
  ok: false
  code: PukalaniErrorCode
  message: string
  /**
   * FACHLICHER Grund der Ablehnung, wenn die Route einen mitgibt
   * (`createError({ status: 409, data: { code: 'last_owner' } })`).
   *
   * Warum das Feld nötig ist (2026-07-29): `code` oben ist aus dem HTTP-Status
   * abgeleitet — 'CONFLICT' sagt „ging nicht", aber nicht „es muss ein Inhaber
   * bleiben". Die `data` eines Fehlers wirft der zentrale Handler bewusst weg
   * (keine Appwrite-Details, keine Stacktraces nach draußen), und damit kam
   * bisher KEIN fachlicher Grund beim Client an — auch der
   * `last_admin`-Zweig der Nutzerverwaltung lief deshalb ins Leere. Statt die
   * ganze `data` durchzulassen, reist genau EIN geprüftes Feld mit.
   *
   * Nur für 4xx (bei 5xx gibt es nichts zu erklären, nur zu verschweigen).
   */
  reason?: string
}

/**
 * PURE (unit-getestet): den fachlichen Grund aus der `data` eines Fehlers holen.
 *
 * Streng absichtlich: nur ein kurzer, maschinenlesbarer Schlüssel
 * (`^[a-z][a-z0-9_]{0,63}$`) kommt durch. Damit kann keine Nachricht, kein
 * Objekt und kein Appwrite-Detail versehentlich in eine Antwort rutschen, wenn
 * irgendwo `data` mit fremdem Inhalt gefüllt ist.
 */
export function domainReasonFrom(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const code = (data as { code?: unknown }).code
  if (typeof code !== 'string') return null
  return /^[a-z][a-z0-9_]{0,63}$/.test(code) ? code : null
}

/** HTTP-Status → stabiler Fehler-Code. */
export function statusToErrorCode(status: number): PukalaniErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'VALIDATION_ERROR'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 429:
      return 'RATE_LIMITED'
    default:
      return 'INTERNAL_ERROR'
  }
}
