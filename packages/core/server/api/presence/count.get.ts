import { Query } from 'node-appwrite'

const FRESH_MS = 45_000 // als online gilt, wer innerhalb 45s gepingt hat
const STALE_MS = 120_000 // ältere Rows werden best-effort aufgeräumt

/**
 * Anzahl aktuell anwesender User für einen scope ('global' = eingeloggt/live,
 * '<type>:<id>' = in einem Thread). Zählt nur frische lastSeen; räumt sehr alte
 * Rows nebenbei auf. Degradiert auf 0, falls die presence-Table fehlt.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const scope = String(getQuery(event).scope ?? 'global')

  try {
    const fresh = await admin.tablesDB.listRows({
      databaseId, tableId: 'presence',
      queries: [
        Query.equal('scope', scope),
        Query.greaterThan('lastSeen', new Date(Date.now() - FRESH_MS).toISOString()),
        Query.limit(100),
      ],
    })

    // Best-effort-Cleanup veralteter Rows (nicht awaited)
    void admin.tablesDB.listRows({
      databaseId, tableId: 'presence',
      queries: [
        Query.equal('scope', scope),
        Query.lessThan('lastSeen', new Date(Date.now() - STALE_MS).toISOString()),
        Query.limit(25),
      ],
    }).then(stale => Promise.all(
      stale.rows.map(row => admin.tablesDB.deleteRow({ databaseId, tableId: 'presence', rowId: row.$id }).catch(() => {})),
    )).catch(() => {})

    return { scope, count: fresh.total }
  }
  catch {
    return { scope, count: 0 }
  }
})
