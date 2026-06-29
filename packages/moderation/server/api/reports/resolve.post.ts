import { Query } from 'node-appwrite'
import { resolveReportSchema } from '../../../schemas/report'
import { REPORTS_TABLE, type Report } from '../../../shared/types/report'

/**
 * Alle offenen Meldungen zu einem Target abschließen (Moderator). Ziel-basiert,
 * weil die Admin-UI pro Kommentar/User arbeitet, nicht pro Report-$id.
 * `resolution` ist ein offener String (z. B. 'hidden' nach Ausblenden,
 * 'no_action' beim Verwerfen) — der Konsument bestimmt die Semantik.
 */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'reports.moderate')

  const parsed = resolveReportSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ status: 400, statusText: 'Invalid resolution' })
  }
  const { targetType, targetId, resolution } = parsed.data

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  const open = await tablesDB.listRows<Report>({
    databaseId,
    tableId: REPORTS_TABLE,
    queries: [
      Query.equal('targetType', targetType),
      Query.equal('targetId', targetId),
      Query.equal('status', 'open'),
      Query.limit(500),
    ],
  })

  for (const row of open.rows) {
    await tablesDB.updateRow<Report>({
      databaseId,
      tableId: REPORTS_TABLE,
      rowId: row.$id,
      data: { status: 'resolved', resolvedBy: user.$id, resolution },
    })
  }

  return { ok: true, resolved: open.rows.length }
})
