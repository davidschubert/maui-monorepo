import { ID } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Schreibt ein Auth-Ereignis (Login/Logout) ins Aktivitätsprotokoll
 * (audit_logs). Bewusst NICHT über recordAudit (admin-Layer) — core darf nicht
 * von admin abhängen; stattdessen direkt in die Tabelle, best effort und
 * graceful, falls sie fehlt (App ohne admin-Layer). Spiegelt das audit_logs-
 * Schema; Actor ist der jeweilige User selbst.
 */
export async function logAuthEvent(
  event: H3Event,
  action: 'user.login' | 'user.logout',
  opts: { userId: string, name?: string, method?: string },
): Promise<void> {
  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const name = opts.name ?? await admin.users.get({ userId: opts.userId }).then(u => u.name).catch(() => '')
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? ''
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
        metadata: opts.method ? JSON.stringify({ method: opts.method }) : '',
        ip,
      },
    })
  }
  catch {
    // Tabelle fehlt / Logging-Fehler → bewusst schlucken (darf Auth nie blockieren)
  }
}
