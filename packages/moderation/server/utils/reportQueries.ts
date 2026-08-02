import { Query } from 'node-appwrite'
import { REPORTS_TABLE, type Report } from '../../shared/types/report'

/**
 * Server-Vertrag des Moderation-Layers für Konsumenten (comments, admin, …).
 * Bewusst als benannte Funktionen statt direktem `reports`-Tabellenzugriff —
 * so bleibt die Kopplung explizit und an einer Stelle (Layer-Grenze A14).
 * Auto-importiert in alle Server-Routen (Nitro), läuft über den AdminClient.
 */

// Reports werden in einem begrenzten Fenster betrachtet (wie die Fenster-Sorts
// Trending/Meistdiskutiert bei comments) — riesige Mengen offener Meldungen sind der Ausnahmefall. Auch die
// Resolve-Route (api/reports/resolve.post.ts) arbeitet mit diesem Fenster.
export const REPORTS_WINDOW = 500

/** Welche der gegebenen Targets hat DIESER User offen gemeldet? */
export async function myOpenReportTargetIds(
  event: import('h3').H3Event,
  targetType: string,
  targetIds: string[],
  reporterId: string,
): Promise<Set<string>> {
  if (targetIds.length === 0) return new Set()
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  const result = new Set<string>()
  // Query.equal ist auf 100 Werte begrenzt → in Batches (Thread-Subtrees können groß sein)
  for (let i = 0; i < targetIds.length; i += 100) {
    const batch = targetIds.slice(i, i + 100)
    const res = await tablesDB.listRows<Report>({
      databaseId,
      tableId: REPORTS_TABLE,
      queries: scopeQuery(event, [
        Query.equal('reporterId', reporterId),
        Query.equal('targetType', targetType),
        Query.equal('targetId', batch),
        Query.equal('status', 'open'),
        Query.limit(batch.length),
      ]),
    })
    for (const row of res.rows) result.add(row.targetId)
  }
  return result
}

/**
 * Alle offenen Meldungen zu einem Target abschließen. Vertrag für Konsumenten
 * (Resolve-Route, admin-Bulk-Aktionen) — `resolution` ist ein offener String
 * (z. B. 'hidden', 'no_action'), die Semantik bestimmt der Aufrufer.
 * Arbeitet im REPORTS_WINDOW; Überlauf wird geloggt und bleibt open (der
 * nächste Lauf erfasst ihn).
 */
export async function resolveReportsForTarget(
  event: import('h3').H3Event,
  targetType: string,
  targetId: string,
  resolution: string,
  resolvedBy: string,
): Promise<number> {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  const open = await tablesDB.listRows<Report>({
    databaseId,
    tableId: REPORTS_TABLE,
    queries: scopeQuery(event, [
      Query.equal('targetType', targetType),
      Query.equal('targetId', targetId),
      Query.equal('status', 'open'),
      Query.limit(REPORTS_WINDOW),
    ]),
  })
  if (open.total > open.rows.length) {
    console.warn(`[moderation] resolve ${targetType}/${targetId}: ${open.total} offene Meldungen, Fenster ${REPORTS_WINDOW} — Rest bleibt open`)
  }

  // Parallel in Chunks statt strikt sequentiell — bei vielen Meldungen pro
  // Target sonst unnötig langsam; Chunk-Größe begrenzt die Last auf Appwrite.
  const CHUNK = 10
  for (let i = 0; i < open.rows.length; i += CHUNK) {
    await Promise.all(open.rows.slice(i, i + CHUNK).map(row =>
      tablesDB.updateRow<Report>({
        databaseId,
        tableId: REPORTS_TABLE,
        rowId: row.$id,
        data: { status: 'resolved', resolvedBy, resolution },
      }),
    ))
  }
  return open.rows.length
}

/**
 * WIE VIELE offene Meldungen hat dieses Target? — die ZAHL, nicht die Zeilen.
 *
 * Moderations-Audit Befund 7 (2026-08-01): die Eskalation zählte bis hierher
 * `openReportsForTarget(...).length`, und die Funktion holt höchstens 100
 * Zeilen. Ein `pukalani.comments.autoHideReports` von 150 hätte deshalb NIE
 * gezündet — der Schwellwert war stillschweigend bei 100 gedeckelt. Hier kommt
 * `total` aus Appwrite: ein Limit von 1 überträgt keine Zeile und zählt trotzdem
 * richtig.
 */
export async function countOpenReportsForTarget(
  event: import('h3').H3Event,
  targetType: string,
  targetId: string,
): Promise<number> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const res = await tablesDB.listRows<Report>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: REPORTS_TABLE,
    queries: scopeQuery(event, [
      Query.equal('targetType', targetType),
      Query.equal('targetId', targetId),
      Query.equal('status', 'open'),
      Query.limit(1),
    ]),
  })
  return res.total
}

/**
 * Alle offenen Meldungen zu EINEM Target (neueste zuerst). Für Detail-Ansichten
 * und den KI-Moderations-Assist (admin) — die Meldegründe/Notizen gehören zum
 * Kontext der Einschätzung.
 *
 * ANZEIGE-FENSTER, KEIN ZÄHLER: die 100 sind bewusst — eine Detailansicht und
 * ein KI-Prompt brauchen keine 5000 Meldegründe. Wer eine ZAHL braucht, nimmt
 * countOpenReportsForTarget (Befund 7).
 */
export async function openReportsForTarget(
  event: import('h3').H3Event,
  targetType: string,
  targetId: string,
): Promise<Report[]> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const res = await tablesDB.listRows<Report>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: REPORTS_TABLE,
    queries: scopeQuery(event, [
      Query.equal('targetType', targetType),
      Query.equal('targetId', targetId),
      Query.equal('status', 'open'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]),
  })
  return res.rows
}

/**
 * Offene Meldungen eines Target-Typs: distinkte Target-IDs nach Aktualität +
 * Anzahl je Target. Für die Moderations-Queue (Admin).
 */
export async function openReportsByTarget(
  event: import('h3').H3Event,
  targetType: string,
): Promise<{ order: string[], counts: Map<string, number> }> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const res = await tablesDB.listRows<Report>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: REPORTS_TABLE,
    queries: scopeQuery(event, [
      Query.equal('targetType', targetType),
      Query.equal('status', 'open'),
      Query.orderDesc('$createdAt'),
      Query.limit(REPORTS_WINDOW),
    ]),
  })

  const counts = new Map<string, number>()
  const order: string[] = []
  for (const row of res.rows) {
    if (!counts.has(row.targetId)) order.push(row.targetId)
    counts.set(row.targetId, (counts.get(row.targetId) ?? 0) + 1)
  }
  return { order, counts }
}
