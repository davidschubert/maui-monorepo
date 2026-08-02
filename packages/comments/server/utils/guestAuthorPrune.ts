import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { GUEST_AUTHORS_TABLE } from '../../shared/types/comment'

/**
 * Gast-Kontaktdaten verfallen (Audit-Befund 2026-08-01, Muster
 * `abuseReportPrune.ts` aus derselben Woche).
 *
 * WARUM ES DIESEN SWEEP BRAUCHT: `guest_authors` ist heute SCHREIB-ONLY. Die
 * Tabelle nimmt Name, E-Mail und IP-Hash jedes Gast-Kommentars auf (E4) und
 * bekommt sie nie wieder los — es gibt keine Lese-Stelle, keinen Löschpfad und
 * keinen Anschluss an die GDPR-Orchestrierung. Der Grund für das Fehlen ist
 * derselbe wie bei den Melder-Adressen: ein Gast hat KEINE userId, und der
 * Contributor-Vertrag (`registerUserDataContributor`) ist genau darauf
 * geschlüsselt. Ohne eigene Frist bliebe die Adresse für immer liegen — und das
 * ist die einzige personenbezogene Spur des Layers, die kein Konto hat.
 *
 * DIE FRIST: 90 Tage ab dem Kommentar (`$createdAt`) — dieselbe Zahl und
 * dieselbe Begründung wie bei den Melder-Adressen, damit die Zusage EINE ist
 * und nicht zwei: „Kontaktdaten ohne Konto leben höchstens 90 Tage."
 *
 * HIER FÄLLT DIE GANZE ZEILE, nicht nur ein Feld — der Unterschied zu
 * `abuse_reports` ist Absicht und liegt am Zweck: eine Missbrauchsmeldung ist
 * der BELEG für eine verhängte Sperre und muss ohne Adresse weiterleben. Eine
 * `guest_authors`-Zeile ist NUR der Rückfragekanal; ohne Name, E-Mail und
 * IP-Hash bleibt von ihr eine commentId übrig, die schon auf dem Kommentar
 * steht. Eine leere Hülle wäre kein Beleg, sondern Datenmüll. Der Kommentar
 * selbst bleibt selbstverständlich stehen.
 *
 * IDEMPOTENT PER KONSTRUKTION: gelöschte Zeilen fallen aus der Abfrage. Es
 * braucht kein Merkmal „schon aufgeräumt".
 *
 * MANDANTENÜBERGREIFEND, und das ist erlaubt: ein Sweep ohne H3Event ist eine
 * der dokumentierten Ausnahmen von der Datentür (CLAUDE.md). Er liegt deshalb
 * in `server/utils` und nicht in `server/plugins` — dort greift der
 * ESLint-Backstop, und eine Ausnahme-Zeile wäre die schlechtere Antwort als der
 * richtige Ort.
 */
export const GUEST_AUTHOR_RETENTION_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** Eine Zeile, wie der Sweep sie sieht — mehr braucht die Entscheidung nicht. */
export interface GuestAuthorPruneCandidate {
  $createdAt?: string
}

/** PURE (unit-getestet): Ist diese Zeile fällig? */
export function shouldPruneGuestAuthor(row: GuestAuthorPruneCandidate, now: number): boolean {
  // Fail-safe wie in `shouldEraseReporterEmail`: ohne lesbaren Zeitstempel wird
  // NICHT gelöscht. Ein unparsbares Datum als „unendlich alt" zu lesen wäre die
  // teure Richtung des Zweifels.
  if (!row.$createdAt) return false
  const parsed = Date.parse(row.$createdAt)
  if (!Number.isFinite(parsed)) return false
  return now - parsed >= GUEST_AUTHOR_RETENTION_DAYS * DAY_MS
}

export interface GuestAuthorPruneResult {
  checked: number
  deleted: number
}

export async function pruneGuestAuthors(now: number = Date.now()): Promise<GuestAuthorPruneResult> {
  const config = useRuntimeConfig()
  const { tablesDB } = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId
  const cutoff = new Date(now - GUEST_AUTHOR_RETENTION_DAYS * DAY_MS).toISOString()

  const listed = await tablesDB.listRows<Models.DefaultRow>({
    databaseId,
    tableId: GUEST_AUTHORS_TABLE,
    queries: [
      Query.lessThan('$createdAt', cutoff),
      // Älteste zuerst: falls je mehr als 100 Zeilen fällig sind, arbeitet sich
      // der Sweep garantiert vorwärts statt immer denselben Ausschnitt zu sehen.
      Query.orderAsc('$createdAt'),
      Query.limit(100),
    ],
  }).catch(() => null)

  // Fail-soft und STILL: die Tabelle entsteht erst mit Migration comments-013,
  // und Gast-Kommentare sind ein Gate, das die meisten Deployments nie
  // einschalten. Ein stündlicher Stapel Fehler wäre in so einem Projekt kein
  // Hinweis, sondern Rauschen, in dem echte Meldungen untergehen.
  if (!listed) return { checked: 0, deleted: 0 }

  let deleted = 0
  for (const row of listed.rows) {
    // Die pure Regel bleibt als Netz DAHINTER stehen (Muster der anderen
    // Sweeps): sie ist die getestete Wahrheit, die Abfrage nur ihre schnelle
    // Vorauswahl.
    if (!shouldPruneGuestAuthor(row, now)) continue
    await tablesDB.deleteRow({ databaseId, tableId: GUEST_AUTHORS_TABLE, rowId: row.$id })
      .then(() => { deleted += 1 })
      .catch(error => logEvent('warn', 'comments.guest_author_prune_failed', {
        rowId: row.$id, message: error instanceof Error ? error.message : String(error),
      }))
  }

  return { checked: listed.rows.length, deleted }
}
