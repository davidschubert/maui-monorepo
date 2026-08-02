import { Query } from 'node-appwrite'
import { z } from 'zod'
import { isCommunityRole } from '../../../../../core/shared/communityAuthz'
import { hasCommunityAccess } from '../../../../shared/communityTeam'
import {
  MY_COMMUNITIES_LIMIT,
  projectMyCommunities,
  type MyCommunitiesResponse,
  type MyCommunityFacts,
} from '../../../../shared/myCommunities'
import { COMMUNITY_MEMBERS_TABLE, isCommunityMemberStatus, type CommunityMemberRow } from '../../../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { verifyRuntimeIdentity } from '../../../utils/onboardingService'

/**
 * „Deine Communities" — die Datenquelle der Kunden-Übersicht auf
 * `my.pukalani.app` (F12).
 *
 * KEIN `communityId` IM BODY, und das ist der ganze Unterschied zu den übrigen
 * Community-Routen dieser Naht: hier fragt jemand nach SICH. Die Grenze ist
 * deshalb nicht eine Capability in einer Community, sondern die Identität aus
 * dem JWT — Appwrite bestätigt sie (`verifyRuntimeIdentity`), das Control Plane
 * glaubt dem Aufrufer nichts. Gesucht wird ausschließlich nach dem Tripel
 * (runtimeProjectId aus der KONFIGURATION, runtimeUserId aus dem JWT); ein
 * Aufrufer kann also weder ein fremdes Projekt noch einen fremden Nutzer nennen.
 *
 * POST für eine Leseabfrage, wie überall in dieser Naht: das JWT reist im BODY,
 * nie in der URL (Logs, Referrer).
 *
 * ZWEI ABFRAGEN, NICHT N+1: erst die Mitgliedschaften, dann EIN
 * `Query.equal('$id', […])` über die Communities — dasselbe Muster wie im
 * Kontingent-Zähler (onboardingProvision.ts). Kein führender Index auf
 * `runtimeUserId` (`idx_lookup` beginnt mit `communityId`): Appwrite verlangt
 * für `equal` keinen, und die Zeilenzahl je Konto ist per Definition klein —
 * ein eigener Index wäre eine Migration für eine Abfrage, die pro Anmeldung
 * einmal läuft.
 *
 * VERWAISTE MITGLIEDSCHAFTEN fallen still weg (Community gelöscht, fremdes
 * Projekt): die Karte hätte kein Ziel. Nicht-`active` Mitgliedschaften kommen
 * gar nicht erst durch — `hasCommunityAccess` ist dieselbe Regel, die auch der
 * Rollen-Resolver anwendet, und genau sie macht „Zugang entziehen" hier wahr:
 * wer entfernt wurde (`status = 'removed'`), sieht die Community nicht mehr in
 * seiner Liste.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
}).strict()

export default defineEventHandler(async (event): Promise<MyCommunitiesResponse> => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const { rows: memberships } = await admin.tablesDB.listRows<CommunityMemberRow>({
    databaseId,
    tableId: COMMUNITY_MEMBERS_TABLE,
    queries: [
      Query.equal('runtimeProjectId', identity.projectId),
      Query.equal('runtimeUserId', identity.userId),
      Query.limit(MY_COMMUNITIES_LIMIT),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read memberships') })

  // Fremde/verfälschte Enum-Werte fallen hier weg, nicht erst in der Ansicht:
  // `isCommunityRole`/`isCommunityMemberStatus` sind die Type-Guards, die aus
  // Spaltenwerten wieder Typen machen.
  const withAccess = memberships.filter(row =>
    isCommunityRole(row.role)
    && isCommunityMemberStatus(row.status)
    && hasCommunityAccess(row.status))
  if (!withAccess.length) return { communities: [] }

  const { rows: communities } = await admin.tablesDB.listRows<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    queries: [
      Query.equal('$id', withAccess.map(row => row.communityId)),
      Query.limit(MY_COMMUNITIES_LIMIT),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read communities') })

  const byId = new Map(communities.map(row => [row.$id, row]))

  const facts: MyCommunityFacts[] = []
  for (const membership of withAccess) {
    const community = byId.get(membership.communityId)
    // Fremdes Projekt: derselbe Mensch kann in mehreren Runtimes Mitglied sein —
    // in DIESER Antwort haben nur die Communities des JWT-Projekts etwas zu
    // suchen, sonst zeigte `my.pukalani.app` Hosts, auf denen diese Session
    // nichts gilt.
    if (!community || community.projectId !== identity.projectId) continue
    facts.push({
      communityId: community.$id,
      name: community.name || community.host,
      host: community.host,
      role: membership.role,
      communityStatus: community.status,
      plan: community.plan,
      trialEndsAt: community.trialEndsAt,
      // M13: roh durchgereicht — ob die Karte bleibt und ob der Zustand sichtbar
      // ist, entscheidet die pure Projektion, nicht diese Route.
      suspension: community.suspension,
    })
  }

  return { communities: projectMyCommunities(facts) }
})
