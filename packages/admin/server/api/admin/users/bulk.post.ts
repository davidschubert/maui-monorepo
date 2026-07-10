import { z } from 'zod'

/**
 * Bulk-Aktionen der User-Liste (Multi-Select): block/unblock für bis zu
 * BULK_MAX Accounts. Guards wie die Einzel-Route (status.patch): der eigene
 * Account ist nicht blockierbar, der letzte Admin bleibt drin. Teilfehler
 * brechen den Batch nicht ab; EIN Audit-Eintrag pro Batch.
 */

const BULK_MAX = 25

const bulkSchema = z.object({
  action: z.enum(['block', 'unblock']),
  ids: z.array(z.string().min(1).max(255)).min(1).max(BULK_MAX),
})

export default defineEventHandler(async (event) => {
  const adminUser = requirePermission(event, 'users.manage')
  const { action, ids } = await readValidatedBody(event, bulkSchema.parse)

  const admin = createAdminClient(event)
  const done: string[] = []
  const failed: string[] = []

  for (const id of [...new Set(ids)]) {
    try {
      if (action === 'block') {
        if (id === adminUser.$id) { failed.push(id); continue }
        // Den letzten Admin nicht aussperren — wirft 400 mit code last_admin
        await assertNotLastAdmin(event, id)
      }
      await admin.users.updateStatus({ userId: id, status: action !== 'block' })
      done.push(id)
    }
    catch (error) {
      console.error(`[admin] Bulk-${action} für User ${id} fehlgeschlagen:`, error)
      failed.push(id)
    }
  }

  await recordAudit(event, {
    action: `user.bulk_${action}`,
    targetType: 'user',
    targetId: '',
    metadata: { count: done.length, failed: failed.length },
  })

  return { ok: failed.length === 0, done, failed }
})
