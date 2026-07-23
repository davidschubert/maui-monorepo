import { Query } from 'node-appwrite'
import { REPORTS_TABLE, type Report, type ReportListResponse } from '../../../shared/types/report'

const PAGE_SIZE = 25

/**
 * Melde-Queue für Moderatoren. Liest über den AdminClient (Row-Security
 * umgangen — bewusst, der Melder soll fremde Meldungen nicht sehen) und ist
 * per `reports.moderate` gated. Filter: status (default 'open', 'all' = alle),
 * optional targetType.
 */
export default defineEventHandler(async (event): Promise<ReportListResponse> => {
  requirePermission(event, 'reports.moderate')

  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : 'open'
  const targetType = typeof query.targetType === 'string' ? query.targetType : ''
  const page = Math.max(1, Number.parseInt(typeof query.page === 'string' ? query.page : '1', 10) || 1)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createAdminClient(event)

  const queries = [
    Query.orderDesc('$createdAt'),
    Query.limit(PAGE_SIZE),
    Query.offset((page - 1) * PAGE_SIZE),
  ]
  if (status !== 'all') queries.push(Query.equal('status', status))
  if (targetType) queries.push(Query.equal('targetType', targetType))

  // H3: im Pool nur die Meldungen des aktuellen Mandanten (Naht 3)
  const res = await tablesDB.listRows<Report>({ databaseId, tableId: REPORTS_TABLE, queries: scopeQuery(event, queries) })
  return { total: res.total, rows: res.rows }
})
