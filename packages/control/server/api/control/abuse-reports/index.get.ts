import { Query } from 'node-appwrite'
import { ABUSE_REPORTS_TABLE, projectAbuseReport, summarizeAbuseReports, type AbuseReportRow } from '../../../../shared/abuseReports'

/** Betreiber: die Missbrauchs-Warteschlange (M13). Neueste zuerst — hier
 *  arbeitet man von oben nach unten. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const { rows, total } = await admin.tablesDB.listRows<AbuseReportRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: ABUSE_REPORTS_TABLE,
    queries: [Query.orderDesc('$createdAt'), Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not list reports') })

  if (total > rows.length) {
    console.warn(`[control] abuse_reports-Liste gekappt: ${rows.length}/${total} — Pagination nachrüsten`)
  }

  const reports = rows.map(projectAbuseReport)
  return { total, stats: summarizeAbuseReports(reports), reports }
})
