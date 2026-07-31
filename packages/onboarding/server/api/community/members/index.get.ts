import { Query } from 'node-appwrite'
import type { CommunityTeamResponse } from '../../../../../control/shared/communityTeam'
import { callControlPlane } from '../../../utils/controlPlane'
import { requireCommunityTeamGate } from '../../../utils/communityTeamGate'

/**
 * Das Team DIESER Community lesen — die Datenquelle von /dashboard/members.
 *
 * Zwei Welten, zwei Beiträge, und keine kann die andere ersetzen:
 *  - Das CONTROL PLANE besitzt `community_members`/`community_invites` und liefert Rollen,
 *    Status, Beitrittsdatum, offene Einladungen.
 *  - Nur die RUNTIME kennt die Nutzer ihres Appwrite-Projekts und ergänzt die
 *    NAMEN. Gebündelt (ein users.list für alle IDs), nicht pro Zeile — dieselbe
 *    Regel wie bei resolveAvatars.
 */
export default defineEventHandler(async (event): Promise<CommunityTeamResponse> => {
  const { communityId, jwt } = await requireCommunityTeamGate(event, 'team.manage')

  const team = await callControlPlane<CommunityTeamResponse>(
    event,
    '/api/control/community/members/list',
    { jwt, communityId },
  )

  const ids = [...new Set(team.members.map(member => member.runtimeUserId).filter(Boolean))]
  const names = new Map<string, string>()
  if (ids.length > 0) {
    try {
      const admin = createAdminClient(event)
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100)
        const res = await admin.users.list({ queries: [Query.equal('$id', batch), Query.limit(batch.length)] })
        for (const user of res.users) {
          if (user.name) names.set(user.$id, user.name)
        }
      }
    }
    catch {
      // Namen sind Komfort, nicht Inhalt: fehlen sie, zeigt die Liste die
      // E-Mail-Adresse — eine leere Seite wäre die schlechtere Antwort.
    }
  }

  return {
    ...team,
    members: team.members.map(member => ({ ...member, name: names.get(member.runtimeUserId) ?? '' })),
  }
})
