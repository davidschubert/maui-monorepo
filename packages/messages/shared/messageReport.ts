/**
 * DER EINGEFRORENE BELEG (Konzept § 2.2, Davids Entscheidung 2) — PUR.
 *
 * ── DER GRUNDSATZ ─────────────────────────────────────────────────────────
 * Niemand vom Stab liest proaktiv private Nachrichten. Es gibt keine
 * Moderations-Ansicht „alle Konversationen dieser Community". Lesbar wird
 * GENAU die Nachricht, die jemand meldet — und zwar so, wie sie im Moment der
 * Meldung dastand.
 *
 * ── WARUM EINE KOPIE UND NICHT DIE ZEILE SELBST ───────────────────────────
 * Zwei Gründe, beide aus dem Konzept:
 *  1. BELEGSICHERHEIT. Löscht oder ändert der Absender danach, bleibt die
 *     Meldung nachvollziehbar. Ohne Kopie wäre „ich lösche es schnell" die
 *     wirksamste Verteidigung gegen jede Meldung.
 *  2. DIE GRENZE IST EINE ROUTE, KEIN PERMISSION-WALL — und das gehört
 *     ausgesprochen. Die Moderation liest über die Operator-Klinke der
 *     Datentür, und die umgeht Row-Permissions ABSICHTLICH. Eine Permission,
 *     die den Moderator aussperrt, wäre für den Admin-Client gar keine. Der
 *     Schutz ist deshalb: es gibt GENAU EINE Route, die eine Nachricht
 *     ausliefert, und sie liefert nur, was `openReportsForTarget` als offen
 *     gemeldet bestätigt — und selbst dann nur die Kopie, nie `body`.
 *     Das Netz darunter ist `scripts/verify-messages.mjs`.
 *
 * ── DIE ERSTE MELDUNG FRIERT EIN, DIE ZWEITE NICHT ────────────────────────
 * Der Eskalations-Handler wird nach JEDER neuen Meldung gerufen. Würde jede
 * den Beleg überschreiben, wäre der Beleg genau das nicht: eine zweite Meldung
 * (Stunden später, Text inzwischen geändert) machte die erste wertlos. Also
 * schreibt nur, wo noch nichts steht.
 */

export interface ReportSnapshotState {
  /** Was heute in `reportedBody` steht ('' = noch nie eingefroren). */
  reportedBody: string
  /** Wann eingefroren wurde ('' = nie). */
  reportedAt: string
}

/** Muss dieser Eskalations-Lauf den Beleg schreiben? */
export function shouldFreezeSnapshot(state: ReportSnapshotState): boolean {
  return state.reportedAt === ''
}

/**
 * Was die Moderation als TEXT bekommt.
 *
 * NIE `body`. Steht kein Beleg da, gibt es nichts zu sehen — auch nicht
 * „ersatzweise den aktuellen Text". Genau dieser Ersatz wäre die Hintertür,
 * durch die eine ungemeldete Nachricht herauskäme.
 */
export function moderatorVisibleBody(state: ReportSnapshotState): string | null {
  return state.reportedAt === '' ? null : state.reportedBody
}

/**
 * DIE BEFRISTETE AUSNAHME VOM LÖSCHRECHT (Konzept § 6, Ausnahme 1).
 *
 * Ein eingefrorener Beleg zu einer OFFENEN Meldung überlebt die Konto-Löschung
 * — 90 Tage ab der Meldung. Begründung analog zu Davids Entscheidung vom
 * 2026-08-02 (`abuse_reports.reporterEmail`): der Beleg ist die Grundlage
 * einer womöglich verhängten Sperre, und Art. 17 Abs. 3 DSGVO nimmt die
 * Geltendmachung von Rechtsansprüchen vom Löschrecht aus.
 *
 * NACH der Frist gilt keine Ausnahme mehr — dann fällt der Beleg mit dem Rest.
 */
export const REPORT_EVIDENCE_RETENTION_DAYS = 90

/** Ist der Beleg noch geschützt? (`now` als Argument, damit die Regel pur bleibt.) */
export function evidenceStillProtected(reportedAt: string, now: Date): boolean {
  if (!reportedAt) return false
  const at = Date.parse(reportedAt)
  if (!Number.isFinite(at)) return false
  const ageDays = (now.getTime() - at) / (24 * 60 * 60 * 1000)
  return ageDays < REPORT_EVIDENCE_RETENTION_DAYS
}

/**
 * Die wählbaren Melde-Gründe für eine private Nachricht.
 *
 * Bewusst ANDERE als bei einem öffentlichen Beitrag: „Spam" und
 * „unangemessen" gibt es dort auch, „Belästigung" ist hier der Regelfall und
 * steht deshalb vorn. Die Beschriftungen liefert der Konsument lokalisiert
 * (Muster `ReportButton.vue`).
 */
export const MESSAGE_REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'other'] as const
export type MessageReportReason = (typeof MESSAGE_REPORT_REASONS)[number]
