import { Query } from 'node-appwrite'
import { INVITE_CODES_TABLE, type InviteCodeRow } from '../../../../shared/types/inviteCode'
import {
  INVITE_REQUESTS_TABLE,
  evaluateReminder,
  summarizeRequests,
  type InviteRequestRow,
} from '../../../../shared/types/inviteRequest'
import { TENANTS_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'

/**
 * Betreiber: die Warteschlange (sites.manage).
 *
 * Liefert je Anfrage auch das, was der Betreiber zum Entscheiden braucht,
 * ohne selbst nachschlagen zu müssen: wann läuft der zugewiesene Code ab, darf
 * gerade erinnert werden, und — falls eingelöst — WELCHE Community daraus
 * wurde. Der Klartext eines Codes kommt hier nie vor; es gibt ihn nicht mehr.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const now = Date.now()

  const { rows, total } = await admin.tablesDB.listRows<InviteRequestRow>({
    databaseId,
    tableId: INVITE_REQUESTS_TABLE,
    queries: [Query.orderDesc('$createdAt'), Query.limit(100)],
  })

  // Codes und Sites in EINEM Rutsch nachladen statt pro Zeile — sonst wird die
  // Liste bei 50 Anfragen zu 100 Einzelabfragen.
  const codeIds = [...new Set(rows.map(row => row.inviteCodeId).filter(Boolean))]
  const siteIds = [...new Set(rows.map(row => row.siteId).filter(Boolean))]

  const [codes, sites] = await Promise.all([
    codeIds.length
      ? admin.tablesDB.listRows<InviteCodeRow>({
          databaseId, tableId: INVITE_CODES_TABLE,
          queries: [Query.equal('$id', codeIds), Query.limit(100)],
        }).then(res => res.rows).catch(() => [])
      : Promise.resolve([] as InviteCodeRow[]),
    siteIds.length
      ? admin.tablesDB.listRows<TenantRow>({
          databaseId, tableId: TENANTS_TABLE,
          queries: [Query.equal('$id', siteIds), Query.limit(100)],
        }).then(res => res.rows).catch(() => [])
      : Promise.resolve([] as TenantRow[]),
  ])

  const codeById = new Map(codes.map(row => [row.$id, row]))
  const hostById = new Map(sites.map(row => [row.$id, row.host]))

  return {
    total,
    stats: summarizeRequests(rows),
    requests: rows.map((row) => {
      const code = row.inviteCodeId ? codeById.get(row.inviteCodeId) : undefined
      const reminder = evaluateReminder(row, now)
      return {
        id: row.$id,
        email: row.email,
        note: row.note,
        status: row.status || 'new',
        createdAt: row.$createdAt,
        assignedAt: row.assignedAt,
        redeemedAt: row.redeemedAt,
        host: row.siteId ? hostById.get(row.siteId) ?? '' : '',
        reminders: row.reminders ?? 0,
        lastReminderAt: row.lastReminderAt,
        codeExpiresAt: code?.expiresAt ?? null,
        codeStatus: code?.status ?? '',
        canRemind: reminder.allowed,
        remindBlocked: reminder.reason ?? '',
        remindSuggested: reminder.suggested,
      }
    }),
  }
})
