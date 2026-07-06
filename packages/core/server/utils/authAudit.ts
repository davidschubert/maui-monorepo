import { ID } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Selbst-bezogene Auth-/Account-Ereignisse fürs Aktivitätsprotokoll —
 * Login/Logout plus Security-Signale (Passwort, Recovery) und Profil-Updates.
 * Das Audit-Log IST der „Admin-Feed" für diese Ereignisse: admin-only
 * (audit.read), IP-behaftet, bei GDPR-Löschung pseudonymisiert statt
 * gelöscht — genau die Garantien, die der Community-Feed (activities,
 * Hard-Delete) bewusst NICHT hat.
 */
export type AuthAuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.self_deleted'
  | 'user.password_changed'
  | 'user.recovery_requested'
  | 'user.profile_updated'

/**
 * Schreibt ein Auth-Ereignis ins Aktivitätsprotokoll (audit_logs). Bewusst
 * NICHT über recordAudit (admin-Layer) — core darf nicht von admin abhängen;
 * stattdessen direkt in die Tabelle, best effort und graceful, falls sie
 * fehlt (App ohne admin-Layer). Spiegelt das audit_logs-Schema; Actor ist
 * der jeweilige User selbst. `fields` trägt NUR Feldnamen, nie Werte.
 */
export async function logAuthEvent(
  event: H3Event,
  action: AuthAuditAction,
  opts: { userId: string, name?: string, method?: string, fields?: string[] },
): Promise<void> {
  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const name = opts.name ?? await admin.users.get({ userId: opts.userId }).then(u => u.name).catch(() => '')
    // xForwardedFor vertraut dem ersten X-Forwarded-For-Segment → nur gültig
    // hinter einem Trust-Proxy (ploi/nginx terminiert). Ohne Proxy ist die IM
    // Audit-Log gespeicherte IP client-spoofbar.
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? ''
    const metadata: Record<string, unknown> = {}
    if (opts.method) metadata.method = opts.method
    if (opts.fields?.length) metadata.fields = opts.fields
    await admin.tablesDB.createRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'audit_logs',
      rowId: ID.unique(),
      data: {
        actorId: opts.userId,
        actorName: name,
        action,
        targetType: '',
        targetId: '',
        targetName: '',
        metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : '',
        ip,
      },
    })
  }
  catch {
    // Tabelle fehlt / Logging-Fehler → bewusst schlucken (darf Auth nie blockieren)
  }
}
