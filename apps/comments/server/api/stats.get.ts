import { Query } from 'node-appwrite'

/**
 * Öffentliche Eckdaten für die Landingpage: Anzahl aktiver Kommentare + Mitglieder.
 * Bewusst ohne Auth (Showcase) — nur aggregierte Zahlen, keine Inhalte/PII. Nutzt
 * den Runtime-Key serverseitig (rows.read + users.read). Degradiert auf 0.
 * Microcache 60s (Idee 3 / Audit L11): öffentlich + ungedrosselt — ohne Cache
 * wären 2 Appwrite-Count-Queries pro Landingpage-Hit ein billiger Last-Hebel.
 */
const statsCache = createMicrocache<{ comments: number, members: number }>(60_000)

export default defineEventHandler(async (event) => {
  const cached = statsCache.get('stats')
  if (cached) return cached

  const config = useRuntimeConfig(event)
  const { tablesDB, users } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [comments, members] = await Promise.all([
    tablesDB.listRows({
      databaseId,
      tableId: 'comments',
      queries: [Query.equal('status', ['active']), Query.limit(1)],
    }).then(r => r.total).catch(() => 0),
    users.list([Query.limit(1)]).then(r => r.total).catch(() => 0),
  ])

  const response = { comments, members }
  statsCache.set('stats', response)
  return response
})
