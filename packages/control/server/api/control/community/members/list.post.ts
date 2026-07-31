import { z } from 'zod'
import type { CommunityInviteView, CommunityMemberView, CommunityTeamResponse } from '../../../../../shared/communityTeam'
import { listCommunityInvites, requireCommunityTeamContext } from '../../../../utils/communityTeam'

/**
 * Das Team EINER Community lesen (Mitglieder + offene Einladungen).
 *
 * POST für eine Leseabfrage sieht falsch aus, ist hier aber richtig: die
 * Service-Naht trägt das Appwrite-JWT des Handelnden IM BODY (nie in der URL —
 * ein JWT in einer Query-Zeichenkette landet in Logs und Referrern). Alle
 * Routen dieser Naht sind deshalb POST; siehe onboardingService.ts.
 *
 * Die Antwort trägt KEINE Token und keine runtimeProjectId — nur, was die
 * Verwaltungsseite anzeigt. Namen fehlen hier bewusst: nur die RUNTIME kennt die
 * Nutzer ihres Projekts, sie reichert sie an (siehe onboarding/api/community/members).
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event): Promise<CommunityTeamResponse> => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireCommunityTeamContext(event, body, 'team.manage')

  const members: CommunityMemberView[] = context.members.map(row => ({
    id: row.$id,
    runtimeUserId: row.runtimeUserId,
    email: row.email ?? '',
    name: '',
    role: row.role,
    status: row.status,
    joinedAt: row.$createdAt,
    removedAt: row.removedAt ?? null,
    self: row.runtimeUserId === context.identity.userId,
  }))

  // Abgelaufene Einladungen sind keine offenen — sie werden nicht angezeigt und
  // auch nicht aufgeräumt: ein Widerruf-Knopf für etwas, das nichts mehr kann,
  // wäre nur Beschäftigung. Die Row bleibt als Spur.
  const now = Date.now()
  const invites: CommunityInviteView[] = (await listCommunityInvites(event, body.communityId))
    .filter(row => Date.parse(row.expiresAt) > now)
    .map(row => ({
      id: row.$id,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: row.expiresAt,
      createdAt: row.$createdAt,
    }))

  return { members, invites, actorRole: context.actorRole }
})
