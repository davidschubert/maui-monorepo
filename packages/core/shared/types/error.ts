/**
 * Stabiles Fehler-Vertragsformat für die API — gedacht für externe/embeddable
 * Konsumenten, die gegen feste Codes statt HTTP-Status-Raterei programmieren.
 * Greift NUR für `/api/`-Fehler-Responses (siehe server/plugins/error-envelope).
 */
export type MauiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export interface MauiErrorResponse {
  ok: false
  code: MauiErrorCode
  message: string
}

/** HTTP-Status → stabiler Fehler-Code. */
export function statusToErrorCode(status: number): MauiErrorCode {
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
