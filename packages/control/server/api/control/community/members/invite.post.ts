import { ID } from 'node-appwrite'
import { z } from 'zod'
import { decideInvite } from '../../../../../shared/communityTeam'
import { COMMUNITY_INVITES_TABLE, COMMUNITY_INVITE_TTL_MS, type CommunityInviteRow } from '../../../../../shared/types/communityInvite'
import { COMMUNITY_ROLES } from '../../../../../../core/shared/communityAuthz'
import { listCommunityInvites, requireCommunityTeamContext, createCommunityInviteToken, memberFacts, throwOnDenied } from '../../../../utils/communityTeam'
import { sendCommunityInviteMail } from '../../../../utils/communityInviteMail'

/**
 * Jemanden in eine Community einladen — EIN Feld, eine Rollenwahl (Davids
 * Entscheidung 2 vom 2026-07-29).
 *
 * Reihenfolge mit Absicht: erst Regeln, dann MAIL, dann Row. Wie bei den
 * Workspace-Einladungen (M9-T2) gilt „keine Einladung ohne Zustellung": lässt
 * sich die Mail nicht senden, entsteht auch kein pending-Eintrag, der im
 * Dashboard läge und niemanden erreicht (503, nichts angelegt).
 *
 * Eine zweite Einladung an dieselbe Adresse ERSETZT die erste — genau EIN
 * gültiger Link je Adresse, alte Links sterben. Die DB kennt nur den Token-Hash.
 *
 * 'owner' ist hier verboten (decideInvite): Besitz entsteht durch Gründung oder
 * Übergabe, nie durch eine Einladung.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
  email: z.string().email().max(254),
  role: z.enum(COMMUNITY_ROLES),
  locale: z.enum(['de', 'en']).default('de'),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireCommunityTeamContext(event, body, 'team.manage')

  const email = body.email.trim().toLowerCase()
  const activeEmails = context.members
    .filter(row => row.status === 'active')
    .map(row => row.email ?? '')

  throwOnDenied(
    decideInvite({ email, role: body.role, members: context.members.map(memberFacts), activeEmails }),
    { communityId: body.communityId, actor: context.identity.userId, role: body.role },
  )

  const { token, tokenHash } = createCommunityInviteToken()
  const sent = await sendCommunityInviteMail(event, {
    to: email,
    siteName: context.tenant.name || context.tenant.host,
    host: context.tenant.host,
    token,
    role: body.role,
    locale: body.locale,
    invitedByName: context.identity.name,
  })
  if (!sent) {
    throw createError({ status: 503, statusText: 'Mailer not configured' })
  }

  const admin = createAdminClient(event)
  // Vorherige offene Einladung derselben Adresse zurückziehen (nicht löschen —
  // die Spur bleibt, aber der alte Link ist tot).
  const previous = (await listCommunityInvites(event, body.communityId))
    .filter(row => row.email.trim().toLowerCase() === email)
  for (const invite of previous) {
    await admin.tablesDB.updateRow({
      databaseId: context.databaseId, tableId: COMMUNITY_INVITES_TABLE, rowId: invite.$id,
      data: { status: 'revoked' },
    }).catch(() => {})
  }

  const row = await admin.tablesDB.createRow<CommunityInviteRow>({
    databaseId: context.databaseId,
    tableId: COMMUNITY_INVITES_TABLE,
    rowId: ID.unique(),
    data: {
      communityId: body.communityId,
      email,
      role: body.role,
      tokenHash,
      status: 'pending',
      expiresAt: new Date(Date.now() + COMMUNITY_INVITE_TTL_MS).toISOString(),
      invitedBy: context.identity.userId,
      acceptedBy: '',
    },
  }).catch((error) => { throw toH3Error(error, 'Could not create invitation') })

  logEvent('info', 'site.member_invited', {
    communityId: body.communityId,
    inviteId: row.$id,
    role: body.role,
    actor: context.identity.userId,
  })

  return { ok: true, inviteId: row.$id, email, role: body.role, expiresAt: row.expiresAt }
})
