import { resolveReportSchema } from '../../../schemas/report'
import { resolveReportsForTarget } from '../../utils/reportQueries'

/**
 * Alle offenen Meldungen zu einem Target abschließen (Moderator). Ziel-basiert,
 * weil die Admin-UI pro Kommentar/User arbeitet, nicht pro Report-$id.
 * Die eigentliche Arbeit macht der Vertrag resolveReportsForTarget
 * (reportQueries.ts) — auch von den admin-Bulk-Aktionen genutzt.
 */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'reports.moderate')

  const parsed = resolveReportSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ status: 400, statusText: 'Invalid resolution' })
  }
  const { targetType, targetId, resolution } = parsed.data

  const resolved = await resolveReportsForTarget(event, targetType, targetId, resolution, user.$id)
  return { ok: true, resolved }
})
