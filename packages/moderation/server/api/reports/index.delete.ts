import { Query } from 'node-appwrite'
import { REPORTS_TABLE, type Report } from '../../../shared/types/report'

/**
 * Eigene Meldung zu einem Target zurückziehen. Per Target adressiert (der
 * Client kennt die Report-$id nicht). Läuft als der User (Session-Client) —
 * er sieht/löscht via Row-Security nur seine eigene Meldung.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const query = getQuery(event)
  const targetType = typeof query.targetType === 'string' ? query.targetType : ''
  const targetId = typeof query.targetId === 'string' ? query.targetId : ''
  if (!targetType || !targetId) {
    throw createError({ status: 400, statusText: 'Missing target' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)

  const existing = await tablesDB.listRows<Report>({
    databaseId,
    tableId: REPORTS_TABLE,
    queries: [
      Query.equal('reporterId', user.$id),
      Query.equal('targetType', targetType),
      Query.equal('targetId', targetId),
      Query.limit(1),
    ],
  })

  // Nichts zu tun, wenn keine eigene Meldung existiert (idempotent)
  if (existing.rows.length > 0) {
    await tablesDB.deleteRow({ databaseId, tableId: REPORTS_TABLE, rowId: existing.rows[0]!.$id })
  }

  return { ok: true }
})
