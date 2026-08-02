/**
 * DIE FACHLICHEN GRÜNDE DER NUTZERVERWALTUNG — an EINER Stelle.
 *
 * Muster: `packages/moderation/shared/reportErrors.ts`. Die Route wirft
 * `createError({ status, data: { code } })`, der zentrale Handler
 * (core/server/error.ts) hebt genau diesen Schlüssel als `reason` ins
 * Envelope, der Client liest `error.data.reason`.
 *
 * WARUM ES DAS JETZT BRAUCHT (Audit-Befund 2026-08-02): die Löschung eines
 * Kontos kann TEILWEISE scheitern. `deleteUserCompletely` sperrt den Account
 * zuerst und löscht dann Layer für Layer; bricht einer ab, bleibt ein
 * GESPERRTER, halb bereinigter Account zurück, den ein zweiter Lauf
 * fertigmacht. Die Route hängte diese Auskunft als `data.results/failed` an
 * einen 500er — der Handler verwirft die rohe `data`, es kam also NICHTS an,
 * und die Oberfläche sagte „Aktion fehlgeschlagen". Das ist die schlechteste
 * aller Antworten: sie klingt wie „nichts passiert", während in Wahrheit
 * jemand ausgesperrt ist.
 *
 * PURE + unit-getestet, damit zwei Seiten (Liste und Detail) und der Test
 * dieselben Strings benutzen — ein Tippfehler wird sonst still zu
 * „unbekannter Fehler", also genau wieder zur toten Hälfte.
 */

/** Es muss mindestens ein Admin übrig bleiben — 409. */
export const LAST_ADMIN_CODE = 'last_admin'
/** Löschung nur teilweise durchgelaufen, Account gesperrt, Re-Run nötig — 500. */
export const DELETION_INCOMPLETE_CODE = 'deletion_incomplete'

export const USER_ACTION_ERROR_CODES = [
  LAST_ADMIN_CODE,
  DELETION_INCOMPLETE_CODE,
] as const

export type UserActionErrorCode = (typeof USER_ACTION_ERROR_CODES)[number]

/** Grund aus einem `$fetch`-Fehler lesen; `null` = gewöhnlicher Fehlschlag. */
export function userActionErrorCode(error: unknown): UserActionErrorCode | null {
  const reason = (error as { data?: { reason?: unknown } })?.data?.reason
  return typeof reason === 'string' && (USER_ACTION_ERROR_CODES as readonly string[]).includes(reason)
    ? reason as UserActionErrorCode
    : null
}

/**
 * Grund → i18n-Schlüsselpaar für den Fehler-Toast. Ohne Grund die allgemeine
 * Meldung — und die sagt bewusst „es gilt weiter der Stand, den du hier
 * siehst", was bei einer Teil-Löschung eben NICHT stimmt. Genau deshalb hat
 * `deletion_incomplete` einen eigenen Text.
 */
export function userActionErrorKeys(code: UserActionErrorCode | null): { title: string, description: string } {
  switch (code) {
    case LAST_ADMIN_CODE:
      return { title: 'admin.users.lastAdmin', description: 'admin.users.lastAdminDesc' }
    case DELETION_INCOMPLETE_CODE:
      return { title: 'admin.users.deletionIncomplete', description: 'admin.users.deletionIncompleteDesc' }
    default:
      return { title: 'admin.users.actionFailed', description: 'admin.users.actionFailedDesc' }
  }
}
