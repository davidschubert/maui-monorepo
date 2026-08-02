import { z } from 'zod'
import { COMMUNITY_SUSPENSIONS } from '../../../../../../core/shared/communitySuspension'
import { setCommunitySuspension } from '../../../../utils/communitySuspension'

/**
 * Betreiber: eine Community sperren oder entsperren (M13, Auslöser 1 — von
 * Hand, mit protokolliertem Grund).
 *
 * EIGENE ROUTE statt eines weiteren Feldes in `[id].patch.ts`, aus zwei
 * Gründen: das Sperren verlangt einen GRUND (die PATCH-Route kennt nur
 * optionale Einzelfelder, ein Pflichtfeld passte dort nicht hinein), und es ist
 * die einzige Betreiber-Aktion auf einer Community, die deren Kunden sofort
 * spürbar trifft — die gehört an eine Adresse, die man beim Lesen des Codes
 * findet.
 *
 * `reason` ist beim SPERREN Pflicht und beim ENTSPERREN gegenstandslos. Der
 * Text ist keine interne Notiz: genau er steht später im Hinweis, den der Owner
 * liest. Deshalb eine Mindestlänge — „x" ist kein Grund.
 *
 * Wirkung: `abuse` nimmt den Host beim nächsten Resolver-Lauf vom Netz
 * (≤ 30 s Cache), `billing` macht ihn nur-lesend. Beides ist NICHT destruktiv
 * und vollständig umkehrbar.
 */
const bodySchema = z.object({
  suspension: z.enum(['', ...COMMUNITY_SUSPENSIONS]),
  reason: z.string().trim().max(500).optional(),
}).strict().refine(
  body => body.suspension === '' || (body.reason ?? '').length >= 5,
  { message: 'A reason is required when suspending', path: ['reason'] },
)

export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing community id' })

  const body = await readValidatedBody(event, bodySchema.parse)
  return await setCommunitySuspension(event, {
    communityId: id,
    suspension: body.suspension,
    reason: body.reason ?? '',
  })
})
