/**
 * DIE TATSACHE ERFÄHRT DER ABGEWIESENE, DEN GRUND NICHT (Konzept § 2.3).
 *
 * Dieselbe Haltung wie bei M13 (`reason: community_suspended`, CLAUDE.md): der
 * Versuch wird ehrlich abgelehnt — er läuft NICHT ins Leere, das wäre eine
 * Lüge gegenüber dem Absender und triebe ihn zu Ersatzkanälen. Aber warum
 * abgelehnt wird, bleibt offen.
 *
 * ── EIN SCHLÜSSEL FÜR DREI FÄLLE, UND DAS IST DER PUNKT ──────────────────
 * Sperre, Vertrauensstufe und Owner-Schalter ergeben denselben Code. Drei
 * Codes wären ein Auskunftsdienst: „nicht wegen der Stufe" hieße „also
 * blockiert", und damit wüsste der Blockierte genau das, was er nicht wissen
 * soll. Der Satz an der Oberfläche lautet deshalb für alle drei gleich:
 * „Diese Person nimmt derzeit keine Nachrichten von dir an."
 *
 * Der Code reist als `data: { code: … }` und kommt über den zentralen
 * Fehler-Handler (`packages/core/server/error.ts`) als `reason` beim Client
 * an. Die rohe `data` bleibt draußen.
 */
export const RECIPIENT_UNAVAILABLE_CODE = 'recipient_unavailable'

/**
 * Wenn das PRODUKT in dieser Community gar nicht läuft (Owner-Schalter aus)
 * und jemand die Oberfläche aufruft statt zu senden.
 *
 * Getrennt vom Code oben, weil hier NICHTS zu verbergen ist: dass eine
 * Community keine privaten Nachrichten anbietet, ist eine Eigenschaft der
 * Community und keine Aussage über einen Menschen. Er darf und soll es
 * erfahren, sonst sucht er den Fehler bei sich.
 */
export const MESSAGES_DISABLED_CODE = 'messages_disabled'

/** Rate-Budget erschöpft (Konzept § 2.5). Ehrlich benannt: es ist kein Urteil. */
export const MESSAGE_RATE_CODE = 'message_rate_limited'

/** Der Melde-Beleg fehlt — die Moderations-Route liefert dann NICHTS (§ 2.2). */
export const NOT_REPORTED_CODE = 'not_reported'

/** Der eine Fehler-Schlüssel aus einer Antwort lesen (Client-Seite). */
export function messageErrorReason(error: unknown): string | null {
  const data = (error as { data?: { reason?: unknown } } | null)?.data
  return typeof data?.reason === 'string' ? data.reason : null
}
