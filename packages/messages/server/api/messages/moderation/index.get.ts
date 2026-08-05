import { z } from 'zod'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/**
 * DIE MELDE-WARTESCHLANGE der privaten Nachrichten.
 *
 * Sie ist der Grund, warum dieser Layer `targetType: 'message'` überhaupt
 * registrieren darf: der Kopf von `moderation/server/utils/reportTargets.ts`
 * sagt es beim Namen — „ein `targetType`, den niemand moderiert, ist ein
 * VERSPRECHEN INS LEERE". Beides oder keins.
 *
 * ── GELISTET WIRD NUR, WAS EINGEFROREN IST ───────────────────────────────
 * Also genau das, was gemeldet wurde. Eine Liste über alle Nachrichten mit
 * nachträglichem Filter wäre der Anfang der Moderations-Ansicht „alle
 * Konversationen dieser Community", die dieses Konzept ausschließt.
 *
 * Der TEXT in dieser Liste ist der eingefrorene Beleg, nie der lebende Text —
 * `moderatorVisibleBody` gibt für eine nicht eingefrorene Zeile `null`.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  await requireCommunityPermission(event, 'reports.moderate')
  const { limit } = await getValidatedQuery(event, querySchema.parse)

  return { messages: await listReportedMessages(event, limit) }
})
