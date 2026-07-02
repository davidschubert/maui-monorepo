import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * GDPR-Contributor des system-Layers (Vertrag: core/server/utils/userData.ts)
 * — der erste Server-Code in diesem Layer (bisher reiner Schema-Owner).
 *
 * notifications: Export als Empfänger; Löschung als Empfänger UND als
 * Verursacher (per senderId, Migration system-008 — Alt-Rows ohne senderId
 * sind die akzeptierte E8-Lücke: nur der Empfänger kann sie lesen, sie
 * sterben mit dessen Löschung).
 *
 * audit_logs: PSEUDONYMISIERUNG statt Löschung (Art. 17 (3) e — Audit-
 * Integrität): actorName/ip/metadata.name leeren, actorId + Struktur
 * bleiben (nach users.delete keinem Menschen mehr zuordenbar); targetName
 * für Logs, die auf den User zeigen, ebenfalls leeren. Plan §4.6.
 */

type NotificationRow = Models.Row & { recipientId: string, type: string, title: string, body: string, link: string, read: boolean }
type AuditRow = Models.Row & { actorId: string, actorName: string, action: string, targetId: string, targetName: string, metadata: string, ip: string }

const NOTIFICATIONS = 'notifications'
const AUDIT_LOGS = 'audit_logs'

export async function systemExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const received = await listAllRows<NotificationRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    NOTIFICATIONS,
    [Query.equal('recipientId', userId)],
  )
  return {
    notifications: received.map(r => ({
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      read: r.read,
      createdAt: r.$createdAt,
    })),
  }
}

/** metadata-JSON ohne `name`-Feld (self_deleted trägt sonst den Klarnamen). */
function stripNameFromMetadata(metadata: string): string {
  if (!metadata) return ''
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    if (!('name' in parsed)) return metadata
    delete parsed.name
    return Object.keys(parsed).length ? JSON.stringify(parsed) : ''
  }
  catch {
    // kein valides JSON → sicherheitshalber komplett leeren
    return ''
  }
}

export async function systemDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0
  let anonymized = 0

  // Notifications als Empfänger + als Verursacher → Hard-Delete
  for (const filter of [Query.equal('recipientId', userId), Query.equal('senderId', userId)]) {
    const rows = await listAllRows<NotificationRow>(tablesDB, databaseId, NOTIFICATIONS, [filter])
      // senderId-Query schlägt vor Migration 008 fehl → wie leere Menge behandeln
      .catch(() => [] as NotificationRow[])
    for (const row of rows) {
      await tablesDB.deleteRow({ databaseId, tableId: NOTIFICATIONS, rowId: row.$id })
      deleted++
    }
  }

  // Audit-Logs: Actor-Pseudonymisierung (Name, IP, metadata.name)
  const asActor = await listAllRows<AuditRow>(tablesDB, databaseId, AUDIT_LOGS, [Query.equal('actorId', userId)])
  for (const row of asActor) {
    const nextMetadata = stripNameFromMetadata(row.metadata)
    if (row.actorName === '' && row.ip === '' && nextMetadata === row.metadata) continue // idempotent: schon sauber
    await tablesDB.updateRow({
      databaseId,
      tableId: AUDIT_LOGS,
      rowId: row.$id,
      data: { actorName: '', ip: '', metadata: nextMetadata },
    })
    anonymized++
  }

  // Audit-Logs, die auf den User ZEIGEN: targetName leeren
  const asTarget = await listAllRows<AuditRow>(tablesDB, databaseId, AUDIT_LOGS, [Query.equal('targetId', userId)])
  for (const row of asTarget) {
    if (row.targetName === '') continue // idempotent
    await tablesDB.updateRow({ databaseId, tableId: AUDIT_LOGS, rowId: row.$id, data: { targetName: '' } })
    anonymized++
  }

  return { deleted, anonymized }
}
