import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { REPORTS_TABLE, type Report } from '../../shared/types/report'

/**
 * GDPR-Contributor des moderation-Layers (Vertrag: core/server/utils/userData.ts).
 *
 * Export: alle Meldungen des Users (als Melder).
 * Löschung: Melder-Rows werden HART gelöscht (eine Meldung ist Meinungs-/
 * Verhaltensdatum des Melders; der Moderations-EFFEKT — hidden-Status des
 * Ziels, Audit — bleibt unabhängig davon bestehen). War der Gelöschte
 * Moderator, wird `resolvedBy` pseudonymisiert (Full-Scan via listAllRows —
 * Reports-Volumen ist klein, Plan §4.5/E6). Plan-Referenz: §4.5.
 */

export async function moderationExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const reports = await listAllRows<Report>(
    tablesDB,
    config.public.appwriteDatabaseId,
    REPORTS_TABLE,
    [Query.equal('reporterId', userId)],
  )
  return {
    reports: reports.map(r => ({
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      note: r.note,
      status: r.status,
      createdAt: r.$createdAt,
    })),
  }
}

export async function moderationDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // Als Melder: Hard-Delete
  const asReporter = await listAllRows<Report>(tablesDB, databaseId, REPORTS_TABLE, [Query.equal('reporterId', userId)])
  for (const row of asReporter) {
    await tablesDB.deleteRow({ databaseId, tableId: REPORTS_TABLE, rowId: row.$id })
  }

  // Als Moderator (resolvedBy): pseudonymisieren — Full-Scan, resolvedBy hat
  // keinen Index (bewusst, E6: Volumen klein; Filter in Code statt Query).
  const all = await listAllRows<Report>(tablesDB, databaseId, REPORTS_TABLE, [])
  const asResolver = all.filter(r => r.resolvedBy === userId)
  for (const row of asResolver) {
    await tablesDB.updateRow({ databaseId, tableId: REPORTS_TABLE, rowId: row.$id, data: { resolvedBy: '' } })
  }

  return { deleted: asReporter.length, anonymized: asResolver.length }
}
