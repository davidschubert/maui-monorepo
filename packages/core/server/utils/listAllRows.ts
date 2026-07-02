import { Query } from 'node-appwrite'
import type { Models, TablesDB } from 'node-appwrite'

const PAGE = 100
// Notanker gegen entgleisende Pagination — GDPR-Export/-Löschung MUSS
// vollständig sein, deshalb Fehler statt stillem Kappen (§4.2 im Plan).
const HARD_CAP = 50_000

/**
 * ALLE Rows einer Query per Cursor einsammeln (GDPR-Export/-Löschung:
 * Vollständigkeit ist Pflicht, `Query.limit(1000)`-Fenster sind verboten).
 * `filters` OHNE limit/cursor übergeben — beides steuert die Schleife.
 */
export async function listAllRows<T extends Models.Row>(
  tablesDB: TablesDB,
  databaseId: string,
  tableId: string,
  filters: string[],
): Promise<T[]> {
  const rows: T[] = []
  let cursor: string | undefined
  for (;;) {
    const res = await tablesDB.listRows<T>({
      databaseId,
      tableId,
      queries: [...filters, Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
    })
    rows.push(...res.rows)
    if (res.rows.length < PAGE) return rows
    if (rows.length >= HARD_CAP) {
      throw new Error(`listAllRows: HARD_CAP (${HARD_CAP}) erreicht für ${tableId} — Abbruch statt unvollständigem Ergebnis`)
    }
    cursor = res.rows.at(-1)!.$id
  }
}
