import { z } from 'zod'
import { decideTransfer } from '../../../../../shared/siteTeam'
import { SITE_MEMBERS_TABLE, type SiteMemberRow } from '../../../../../shared/types/siteMember'
import { memberFacts, requireSiteTeamContext, throwOnDenied } from '../../../../utils/siteTeam'

/**
 * Besitz übertragen (Davids Entscheidung 3 vom 2026-07-29: JA — Community
 * LÖSCHEN dagegen bewusst später, `site.delete` ist hier absichtlich nicht
 * gebaut).
 *
 * Autorisiert über `site.transfer` — eine OWNER-Capability. Das ist der Grund,
 * warum die Rollen-Route 'owner' verweigert: sonst wäre Besitz über eine
 * Admin-Capability erreichbar.
 *
 * Danach ist der Übertragende ADMIN, nicht mehr Owner — und nicht draußen. Beide
 * Schreibvorgänge in einer Reihenfolge, die keinen ownerlosen Zustand erzeugt:
 * erst das ZIEL zum Owner (jetzt gibt es zwei), dann sich selbst zurückstufen.
 * Bricht der zweite Schritt ab, bleiben zwei Owner — unschön, aber niemand ist
 * ausgesperrt; die umgekehrte Reihenfolge könnte eine Community ohne Owner
 * hinterlassen.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  siteId: z.string().min(1).max(36),
  memberId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireSiteTeamContext(event, body, 'site.transfer')

  const target = context.members.find(row => row.$id === body.memberId)
  if (!target) {
    throw createError({ status: 404, statusText: 'Member not found' })
  }

  throwOnDenied(
    decideTransfer({
      actorUserId: context.identity.userId,
      actorRole: context.actorRole,
      target: memberFacts(target),
    }),
    { siteId: body.siteId, actor: context.identity.userId, target: target.$id },
  )

  const admin = createAdminClient(event)
  await admin.tablesDB.updateRow<SiteMemberRow>({
    databaseId: context.databaseId,
    tableId: SITE_MEMBERS_TABLE,
    rowId: target.$id,
    data: { role: 'owner' },
  }).catch((error) => { throw toH3Error(error, 'Could not transfer ownership') })

  await admin.tablesDB.updateRow<SiteMemberRow>({
    databaseId: context.databaseId,
    tableId: SITE_MEMBERS_TABLE,
    rowId: context.actor.$id,
    data: { role: 'admin' },
  }).catch((error) => { throw toH3Error(error, 'Ownership transferred, but demotion failed') })

  logEvent('warn', 'site.ownership_transferred', {
    siteId: body.siteId,
    from: context.identity.userId,
    to: target.runtimeUserId,
    memberId: target.$id,
  })

  return { ok: true, ownerMemberId: target.$id, previousOwnerRole: 'admin' as const }
})
