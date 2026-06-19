import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AuditLogEntry, AuditLogListResponse } from '../../../shared/types/admin'

const PAGE_SIZE = 30

type AuditRow = Models.Row & Omit<AuditLogEntry, '$id' | '$createdAt'>

/** Audit-Log: protokollierte Admin-Aktionen, neueste zuerst. */
export default defineEventHandler(async (event): Promise<AuditLogListResponse> => {
  requireAdmin(event)

  const page = Math.max(1, Number(getQuery(event).page ?? 1) || 1)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const result = await admin.tablesDB.listRows<AuditRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'audit_logs',
    queries: [
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
  })

  return {
    total: result.total,
    entries: result.rows.map(row => ({
      $id: row.$id,
      $createdAt: row.$createdAt,
      actorId: row.actorId,
      actorName: row.actorName,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      targetName: row.targetName,
      metadata: row.metadata,
      ip: row.ip ?? '',
    })),
  }
})
