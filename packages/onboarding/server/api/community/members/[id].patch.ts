import { z } from 'zod'
import { COMMUNITY_ROLES } from '../../../../../core/shared/communityAuthz'
import { callControlPlane } from '../../../utils/controlPlane'
import { requireCommunityTeamGate } from '../../../utils/communityTeamGate'

/**
 * Rolle eines Mitglieds ändern. Die Schutzregeln (kein Selbst-Degradieren, nicht
 * der letzte Owner, 'owner' nur per Übergabe) setzt das Control Plane durch —
 * hier wird nur gefragt. Ein 409 mit `data.code` trägt den Grund zur UI.
 */
const bodySchema = z.object({ role: z.enum(COMMUNITY_ROLES) }).strict()

export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireCommunityTeamGate(event, 'team.manage')
  const memberId = getRouterParam(event, 'id')
  if (!memberId) {
    throw createError({ status: 400, statusText: 'Missing member id' })
  }
  const body = await readValidatedBody(event, bodySchema.parse)

  return await callControlPlane<{ ok: boolean, memberId: string, role: string }>(
    event,
    '/api/control/community/members/role',
    { jwt, communityId, memberId, role: body.role },
  )
})
