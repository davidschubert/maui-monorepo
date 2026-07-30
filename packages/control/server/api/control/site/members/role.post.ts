import { z } from 'zod'
import { decideRoleChange } from '../../../../../shared/siteTeam'
import { SITE_MEMBERS_TABLE, SITE_ROLES, type SiteMemberRow } from '../../../../../shared/types/siteMember'
import { memberFacts, requireSiteTeamContext, throwOnDenied } from '../../../../utils/siteTeam'

/**
 * Die Rolle eines Mitglieds ändern.
 *
 * Die Schutzregeln stehen PURE in shared/siteTeam.ts (decideRoleChange) und
 * werden hier durchgesetzt — kein Selbst-Degradieren, kein Antasten des letzten
 * Owners, 'owner' nur per Übergabe. Die UI kennt dieselben Regeln, aber die
 * Entscheidung fällt hier: eine ausgegraute Schaltfläche ist keine Grenze.
 *
 * Wirksam wird die neue Rolle, sobald der Resolver-Cache der Platform-App
 * abgelaufen ist (≤30 s) — dasselbe Fenster wie beim Rollen-Entzug.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  siteId: z.string().min(1).max(36),
  memberId: z.string().min(1).max(36),
  role: z.enum(SITE_ROLES),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireSiteTeamContext(event, body, 'team.manage')

  // Das Ziel MUSS aus der bereits gescopten Liste kommen: eine memberId aus einer
  // anderen Community findet sich hier nicht (404), statt per getRow zu greifen.
  const target = context.members.find(row => row.$id === body.memberId)
  if (!target) {
    throw createError({ status: 404, statusText: 'Member not found' })
  }

  throwOnDenied(
    decideRoleChange({
      actorUserId: context.identity.userId,
      actorRole: context.actorRole,
      target: memberFacts(target),
      nextRole: body.role,
      members: context.members.map(memberFacts),
    }),
    { siteId: body.siteId, actor: context.identity.userId, target: target.$id, role: body.role },
  )

  const admin = createAdminClient(event)
  const row = await admin.tablesDB.updateRow<SiteMemberRow>({
    databaseId: context.databaseId,
    tableId: SITE_MEMBERS_TABLE,
    rowId: target.$id,
    data: { role: body.role },
  }).catch((error) => { throw toH3Error(error, 'Could not update member') })

  logEvent('info', 'site.member_role_changed', {
    siteId: body.siteId,
    memberId: row.$id,
    role: body.role,
    previousRole: target.role,
    actor: context.identity.userId,
  })

  return { ok: true, memberId: row.$id, role: row.role }
})
