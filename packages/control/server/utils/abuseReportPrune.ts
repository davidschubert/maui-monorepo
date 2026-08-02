import { Query } from 'node-appwrite'
import { ABUSE_REPORTS_TABLE, type AbuseReportRow } from '../../shared/abuseReports'

/**
 * Melder-Adressen verfallen (F8-Rest, Davids Entscheidung 2026-08-02).
 *
 * WARUM ES DIESEN SWEEP ÜBERHAUPT GIBT: `abuse_reports.reporterEmail` ist die
 * EINZIGE personenbezogene Spur, die kein Konto hat. Wer eine Community meldet,
 * ist fast nie Mitglied darin und meist gar nicht angemeldet — es gibt keine
 * userId, an der ein GDPR-Contributor (`registerUserDataContributor`) ansetzen
 * könnte. Diese Adresse erreicht also NIEMAND über den normalen Löschpfad; ohne
 * eigene Frist bliebe sie für immer liegen.
 *
 * DIE FRIST: 90 Tage, gerechnet ab der MELDUNG (`$createdAt`) und unabhängig
 * vom Status. Die Zusage soll hart sein und ohne Fußnote aussprechbar: „eine
 * Melder-Adresse lebt höchstens 90 Tage". Ein Anker an der Bearbeitung
 * (`handledAt`) klänge naheliegender — er machte die Zusage aber von der
 * Warteschlangen-Disziplin des Betreibers abhängig: eine Meldung, die ein Jahr
 * unbearbeitet liegt, hielte die Adresse ein Jahr fest. Genau das darf die
 * Bequemlichkeit des Betreibers nicht entscheiden.
 *
 * DIE ZEILE BLEIBT. Gelöscht wird nur das Feld. Die Meldung ist der Beleg für
 * eine womöglich verhängte Sperre — sie zu entfernen hieße, die Begründung der
 * eigenen Maßnahme wegzuwerfen. Ohne Adresse ist sie dann exakt das, was eine
 * anonyme Meldung von Anfang an ist (dieselbe Zeile, nur ohne Rückfragekanal).
 *
 * IDEMPOTENT PER KONSTRUKTION: eine geleerte Zeile trägt `null` und fällt damit
 * aus der Kandidaten-Abfrage. Es braucht kein Merkmal „schon aufgeräumt".
 */
export const REPORTER_EMAIL_RETENTION_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** PURE (unit-getestet): Ist die Adresse dieser Zeile fällig? */
export function shouldEraseReporterEmail(
  row: Pick<AbuseReportRow, 'reporterEmail'> & { $createdAt?: string },
  now: number,
): boolean {
  // Nichts zu löschen: die anonyme Meldung ist der Normalfall (die Spalte hat
  // '' als Vorgabe, nicht null — beide Schreibweisen meinen hier „keine
  // Adresse").
  if (!row.reporterEmail) return false
  // Fail-safe wie in `shouldPruneRequest`: ohne lesbaren Zeitstempel wird
  // NICHT gelöscht. Ein unparsbares Datum als „unendlich alt" zu lesen wäre
  // die teure Richtung des Zweifels.
  if (!row.$createdAt) return false
  const parsed = Date.parse(row.$createdAt)
  if (!Number.isFinite(parsed)) return false
  return now - parsed >= REPORTER_EMAIL_RETENTION_DAYS * DAY_MS
}

export interface ReporterEmailPruneResult {
  checked: number
  erased: number
}

export async function eraseStaleReporterEmails(now: number = Date.now()): Promise<ReporterEmailPruneResult> {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId
  const cutoff = new Date(now - REPORTER_EMAIL_RETENTION_DAYS * DAY_MS).toISOString()

  const { rows } = await admin.tablesDB.listRows<AbuseReportRow>({
    databaseId,
    tableId: ABUSE_REPORTS_TABLE,
    queries: [
      // BEIDE Leer-Schreibweisen fliegen schon in der Abfrage raus, nicht erst
      // in der Schleife: anonyme Meldungen sind die Mehrheit, und sie würden
      // sonst Stunde für Stunde die 100 Plätze belegen, ohne dass je etwas
      // passiert — der Sweep käme an den wirklich fälligen Zeilen nie an.
      Query.isNotNull('reporterEmail'),
      Query.notEqual('reporterEmail', ''),
      Query.lessThan('$createdAt', cutoff),
      // Älteste zuerst: falls je mehr als 100 Zeilen fällig sind, arbeitet sich
      // der Sweep garantiert vorwärts statt immer denselben Ausschnitt zu sehen.
      Query.orderAsc('$createdAt'),
      Query.limit(100),
    ],
  })

  let erased = 0
  for (const row of rows) {
    // Die pure Regel bleibt als Netz DAHINTER stehen (Muster wie beim
    // Anfragen-Aufräumen): sie ist die getestete Wahrheit, die Abfrage nur ihre
    // schnelle Vorauswahl.
    if (!shouldEraseReporterEmail(row, now)) continue
    await admin.tablesDB.updateRow<AbuseReportRow>({
      databaseId,
      tableId: ABUSE_REPORTS_TABLE,
      rowId: row.$id,
      data: { reporterEmail: null },
    })
      .then(() => { erased += 1 })
      .catch(error => logEvent('warn', 'abuse.reporter_email_prune_failed', {
        reportId: row.$id, message: error instanceof Error ? error.message : String(error),
      }))
  }

  return { checked: rows.length, erased }
}
