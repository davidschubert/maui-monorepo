import { Query } from 'node-appwrite'

/**
 * Öffentliche Eckdaten für die Landingpage: Anzahl aktiver Kommentare + Mitglieder.
 * Bewusst ohne Auth (Showcase) — nur aggregierte Zahlen, keine Inhalte/PII. Nutzt
 * den Runtime-Key serverseitig (rows.read + users.read). Degradiert auf 0.
 */
export default defineEventHandler(async (event) => {
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

  return { comments, members }
})
