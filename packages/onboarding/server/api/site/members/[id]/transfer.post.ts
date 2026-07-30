import { callControlPlane } from '../../../../utils/controlPlane'
import { requireSiteTeamGate } from '../../../../utils/siteTeamGate'

/**
 * Besitz an dieses Mitglied übertragen (Davids Entscheidung 3: JA).
 *
 * Autorisiert über `site.transfer` — die OWNER-Capability, nicht `team.manage`.
 * Deshalb kann ein Admin die Verwaltung führen, aber keinen Besitz verschieben.
 * Danach ist der Übertragende Admin.
 */
export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireSiteTeamGate(event, 'site.transfer')
  const memberId = getRouterParam(event, 'id')
  if (!memberId) {
    throw createError({ status: 400, statusText: 'Missing member id' })
  }

  return await callControlPlane<{ ok: boolean, ownerMemberId: string }>(
    event,
    '/api/control/site/members/transfer',
    { jwt, communityId, memberId },
  )
})
