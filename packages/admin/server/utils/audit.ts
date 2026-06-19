import { ID } from 'node-appwrite'
import type { H3Event } from 'h3'

interface AuditInput {
  /** z.B. 'user.block', 'comment.hidden' */
  action: string
  targetType?: string
  targetId?: string
  targetName?: string
  metadata?: Record<string, unknown>
}

/**
 * Schreibt einen Audit-Eintrag (wer hat was getan). Best effort — ein Fehler
 * beim Logging darf die eigentliche Admin-Aktion NIE blockieren.
 */
export async function recordAudit(event: H3Event, input: AuditInput): Promise<void> {
  const actor = event.context.user
  if (!actor) return

  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    await admin.tablesDB.createRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'audit_logs',
      rowId: ID.unique(),
      data: {
        actorId: actor.$id,
        actorName: actor.name,
        action: input.action,
        targetType: input.targetType ?? '',
        targetId: input.targetId ?? '',
        targetName: input.targetName ?? '',
        metadata: input.metadata ? JSON.stringify(input.metadata) : '',
      },
    })
  }
  catch {
    // Logging-Fehler bewusst schlucken
  }
}
