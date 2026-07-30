import { z } from 'zod'
import { decideRemoval } from '../../../../../shared/siteTeam'
import { SITE_MEMBERS_TABLE, type SiteMemberRow } from '../../../../../shared/types/siteMember'
import { memberFacts, requireSiteTeamContext, throwOnDenied } from '../../../../utils/siteTeam'

/**
 * Einem Mitglied den ZUGANG entziehen (Davids Entscheidung 1 vom 2026-07-29).
 *
 * Die Row wird NICHT gelöscht, sondern auf status='removed' gesetzt. Zwei Gründe,
 * und beide sind Produkt, nicht Bequemlichkeit:
 *
 *  1. Inhalte bleiben erhalten UND behalten den Namen — ein Rauswurf soll keine
 *     Löcher in Threads reißen, in denen andere geantwortet haben.
 *  2. „Ehemaliges Mitglied" braucht eine POSITIVE Tatsache. Aus einer gelöschten
 *     Row ließe sich das nicht ableiten: in einer Pool-Community steht in
 *     site_members nur das Team, nicht jede mitlesende Person — „keine Row" heißt
 *     also „normaler Nutzer", nicht „rausgeworfen".
 *
 * Echtes Löschen bleibt der getrennte DSGVO-Weg (Konto löschen). Der Zugang ist
 * spätestens nach dem Resolver-Cache (≤30 s) weg; der Site-LABEL-Leseumfang
 * bleibt bestehen (A4: das Label bedeutet „hat diesen Host benutzt" und wird bei
 * jedem eingeloggten Besuch neu vergeben) — das ist bewusst nicht Teil dieser
 * Aktion.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  siteId: z.string().min(1).max(36),
  memberId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireSiteTeamContext(event, body, 'team.manage')

  const target = context.members.find(row => row.$id === body.memberId)
  if (!target) {
    throw createError({ status: 404, statusText: 'Member not found' })
  }

  throwOnDenied(
    decideRemoval({
      actorUserId: context.identity.userId,
      actorRole: context.actorRole,
      target: memberFacts(target),
      members: context.members.map(memberFacts),
    }),
    { siteId: body.siteId, actor: context.identity.userId, target: target.$id },
  )

  const admin = createAdminClient(event)
  const row = await admin.tablesDB.updateRow<SiteMemberRow>({
    databaseId: context.databaseId,
    tableId: SITE_MEMBERS_TABLE,
    rowId: target.$id,
    data: { status: 'removed', removedAt: new Date().toISOString() },
  }).catch((error) => { throw toH3Error(error, 'Could not remove member') })

  logEvent('info', 'site.member_removed', {
    siteId: body.siteId,
    memberId: row.$id,
    role: target.role,
    actor: context.identity.userId,
  })

  return { ok: true, memberId: row.$id, status: row.status }
})
