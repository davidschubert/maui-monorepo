import { z } from 'zod'
import { decideRemoval } from '../../../../../shared/communityTeam'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../../shared/types/communityMember'
import { memberFacts, requireCommunityTeamContext, throwOnDenied } from '../../../../utils/communityTeam'

/**
 * Einem Mitglied den ZUGANG entziehen (Davids Entscheidung 1 vom 2026-07-29).
 *
 * Die Row wird NICHT gelöscht, sondern auf status='removed' gesetzt. Zwei Gründe,
 * und beide sind Produkt, nicht Bequemlichkeit:
 *
 *  1. Inhalte bleiben erhalten UND behalten den Namen — ein Rauswurf soll keine
 *     Löcher in Threads reißen, in denen andere geantwortet haben.
 *  2. „Ehemaliges Mitglied" braucht eine POSITIVE Tatsache. Aus einer gelöschten
 *     Row ließe sich das nicht ableiten: Gäste, Autoren von vor A5 und Konten,
 *     die hier nie mitgemacht haben, haben ebenfalls keine Row — „keine Row"
 *     heißt also „normaler Nutzer", nicht „rausgeworfen".
 *  3. Und seit A5 der wichtigste Grund: `members/join` braucht die Zeile, um
 *     einen ENTZOGENEN Zugang von einem Erst-Beitritt zu unterscheiden. Ohne sie
 *     würde der nächste Kommentar der entfernten Person sie wieder hereinlassen.
 *
 * Echtes Löschen bleibt der getrennte DSGVO-Weg (Konto löschen). Die ROLLE ist
 * spätestens nach dem Resolver-Cache (≤30 s) weg.
 *
 * DAS LESE-PUBLIKUM NIMMT DIE RUNTIME (A5, 2026-07-29): das Site-Label lebt im
 * Pool-Projekt, und das Control Plane hat dafür keinen Schlüssel — es kann
 * Labels nicht anfassen. Deshalb gibt diese Route die `runtimeUserId` zurück:
 * die aufrufende Runtime-Route (onboarding .../members/[id].delete.ts) zieht
 * damit `revokeCommunityLabel`. Bis A5 fehlte dieser Schritt ganz, und „Zugang
 * entziehen" nahm nur die Rolle — die entfernte Person las weiter mit, weil die
 * Label-Middleware das Publikum beim nächsten Besuch neu vergab. Der zweite
 * Riegel dagegen steckt in `members/join`: ein entzogener Zugang schlägt jeden
 * Beitritts-Auslöser.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
  memberId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireCommunityTeamContext(event, body, 'team.manage')

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
    { communityId: body.communityId, actor: context.identity.userId, target: target.$id },
  )

  const admin = createAdminClient(event)
  const row = await admin.tablesDB.updateRow<CommunityMemberRow>({
    databaseId: context.databaseId,
    tableId: COMMUNITY_MEMBERS_TABLE,
    rowId: target.$id,
    data: { status: 'removed', removedAt: new Date().toISOString() },
  }).catch((error) => { throw toH3Error(error, 'Could not remove member') })

  logEvent('info', 'site.member_removed', {
    communityId: body.communityId,
    memberId: row.$id,
    role: target.role,
    actor: context.identity.userId,
  })

  return { ok: true, memberId: row.$id, status: row.status, runtimeUserId: target.runtimeUserId }
})
