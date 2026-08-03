/**
 * FEHLT DAS FEATURE IN DER INSTANZ? — PURE, damit es prüfbar ist.
 *
 * ── Der Befund (F37, 2026-08-02) ──────────────────────────────────────────
 * Der passwortlose Login (`pukalani.auth.otp`) ist ein Config-Schalter in der
 * App — aber er funktioniert nur, wenn im APPWRITE-PROJEKT „Email OTP" aktiv
 * ist UND SMTP konfiguriert. Ist eines davon aus, wirft
 * `account.createEmailToken()` einen 501/503, `toH3Error` macht daraus einen
 * 500 „Could not send login code", und die Anmeldeseite zeigt ihr generisches
 * „Code konnte nicht angefordert werden".
 *
 * Das ist eine SACKGASSE mit falscher Fährte: der Nutzer probiert es wieder,
 * der Betreiber sucht den Fehler im Code — dabei fehlt ein Häkchen in der
 * Appwrite-Console. Ein Schalter, den die App anbietet und die Instanz nicht
 * kann, muss das SAGEN.
 *
 * ── Die zwei Fälle (Appwrite response codes, /docs/apis/response-codes) ────
 *  - 501 `user_auth_method_unsupported` — die Anmeldeart ist im Projekt
 *    abgeschaltet („Auth → Settings → Email OTP").
 *  - 503 `general_smtp_disabled` — die Instanz hat gar keinen Mailversand
 *    (`_APP_SMTP_*`), es könnte also keine Mail hinausgehen.
 *
 * BEIDE sind für den Nutzer dasselbe: „das geht hier gerade nicht, nimm den
 * anderen Weg." Deshalb EIN Grund-Schlüssel nach außen (`otp_unavailable`) und
 * die Unterscheidung nur im Server-Log — der Betreiber braucht sie, der Gast
 * nicht.
 *
 * NICHT hierher gehört ein normaler Fehlschlag (falsche Adresse, Rate-Limit,
 * Netz): der bleibt, was er ist. Diese Funktion antwortet ausschließlich auf
 * „die Instanz kann es nicht".
 */

/** Der Grund, der als `reason` im Fehler-Envelope reist (core/server/error.ts). */
export const AUTH_METHOD_UNAVAILABLE_CODE = 'otp_unavailable'

/** Was von einer AppwriteException hier zählt — mehr braucht die Regel nicht. */
export interface AppwriteFailureLike {
  type?: unknown
  code?: unknown
}

/**
 * PURE (unit-getestet): Welche INSTANZ-Ursache steckt hinter dem Fehler —
 * oder `null`, wenn es ein gewöhnlicher Fehlschlag ist.
 *
 * Geprüft wird der `type`, nicht der Status: ein 501 ist auch
 * `user_count_exceeded` („Nutzerlimit erreicht"), und das ist eine ganz andere
 * Auskunft. Der Status allein wäre also zu grob.
 */
export function instanceAuthFeatureGap(error: unknown): 'method_disabled' | 'smtp_disabled' | null {
  if (typeof error !== 'object' || error === null) return null
  const { type } = error as AppwriteFailureLike
  if (type === 'user_auth_method_unsupported') return 'method_disabled'
  if (type === 'general_smtp_disabled') return 'smtp_disabled'
  return null
}
