import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AuditLogEntry, AuditLogListResponse } from '../../../shared/types/admin'

const PAGE_SIZE = 30

type AuditRow = Models.Row & Omit<AuditLogEntry, '$id' | '$createdAt'>

/** Audit-Log: protokollierte Admin-Aktionen, neueste zuerst. */
export default defineEventHandler(async (event): Promise<AuditLogListResponse> => {
  requirePermission(event, 'audit.read')

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const SORTABLE = new Set(['$createdAt', 'actorName'])
  const sort = SORTABLE.has(String(query.sort)) ? String(query.sort) : '$createdAt'
  const dir = query.dir === 'asc' ? 'asc' : 'desc'

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const result = await admin.tablesDB.listRows<AuditRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'audit_logs',
    queries: [
      dir === 'asc' ? Query.orderAsc(sort) : Query.orderDesc(sort),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
  })

  // Avatar-URLs der Actors aus den Account-prefs anreichern (ein Query)
  const avatars = await resolveAvatars(event, result.rows.map(row => row.actorId))

  return {
    total: result.total,
    entries: result.rows.map(row => ({
      $id: row.$id,
      $createdAt: row.$createdAt,
      actorId: row.actorId,
      actorName: row.actorName,
      actorAvatarUrl: avatars.get(row.actorId) ?? '',
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      targetName: row.targetName,
      metadata: row.metadata,
      ip: row.ip ?? '',
    })),
  }
})
