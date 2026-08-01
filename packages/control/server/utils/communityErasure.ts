import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  decideMembershipErasure,
  type CommunityErasureResult,
  type CommunityInviteExport,
  type CommunityMembershipExport,
  type CommunityUserDataExport,
  type RetainedMembership,
} from '../../shared/communityTeam'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'
import { COMMUNITY_INVITES_TABLE, type CommunityInviteRow } from '../../shared/types/communityInvite'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { listCommunityMembers, memberFacts } from './communityTeam'

/**
 * F3 — DSGVO-Auskunft und -Löschung für die Zeilen, die das CONTROL PLANE über
 * einen Runtime-Nutzer führt: seine Mitgliedschaften (`community_members`) und
 * die Einladungen an seine Adresse (`community_invites`).
 *
 * WARUM DAS EINE EIGENE NAHT BRAUCHT: `deleteUserCompletely` läuft in der
 * RUNTIME (Pool-/Silo-App). Sie räumt ihr eigenes Appwrite-Projekt ab — die
 * Mitgliedschaften liegen aber in einem ANDEREN Projekt, auf das sie nur einen
 * read-only-Key hat. Bis F3 blieben sie deshalb stehen: nach der Löschung eines
 * Pool-Kontos zeigte `community_members` weiter auf eine tote `runtimeUserId`,
 * und `community_invites` trug die E-Mail-Adresse der Person unbefristet weiter.
 * Die Adresse ist der eigentliche Befund — eine `userId` ohne Konto ist ein
 * Pseudonym ohne Auflösung, eine E-Mail ist ein Personenbezug.
 *
 * DIE IDENTITÄT KOMMT HIER OHNE JWT (anders als bei allen anderen
 * community-Routen, requireCommunityTeamContext). Das ist kein Aufweichen,
 * sondern die einzige Möglichkeit: zum Zeitpunkt des Aufrufs ist das Konto im
 * Begriff zu verschwinden — bei einem Betreiber-Löschauftrag oder einem Re-Run
 * nach Teilfehler existiert es womöglich gar nicht mehr. Ein JWT zu verlangen
 * hieße, die Löschung genau dann zu verweigern, wenn sie am nötigsten ist.
 * Derselbe Schnitt wie bei der Feedback-Naht (feedback/user-erase.post.ts).
 * Der Gate bleibt das Service-Secret, und gescopt wird hart auf das Paar
 * (runtimeProjectId, runtimeUserId), das der Aufrufer für SICH nennt.
 *
 * GESCOPT HEISST GESCOPT: dieselbe `runtimeUserId` in zwei Appwrite-Projekten
 * sind zwei verschiedene Menschen (deshalb das Anker-Tripel in
 * `community_members`). Auch die Einladungen werden über die Community auf das
 * rufende Projekt eingegrenzt — sonst löschte eine Silo-App die Einladungen
 * einer gleichnamigen Adresse im Pool mit.
 */

/** Communities einmal laden, nicht je Zeile — eine Person kann in vielen sein. */
function communityLoader(event: H3Event) {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const admin = createAdminClient(event)
  const cache = new Map<string, TenantRow | null>()

  return async (communityId: string): Promise<TenantRow | null> => {
    const cached = cache.get(communityId)
    if (cached !== undefined) return cached
    const row = await admin.tablesDB.getRow<TenantRow>({
      databaseId, tableId: COMMUNITIES_TABLE, rowId: communityId,
    }).catch(() => null)
    cache.set(communityId, row)
    return row
  }
}

/** Anzeigename einer Community — Name, ersatzweise Host, ersatzweise Id. */
function communityLabel(community: TenantRow | null, communityId: string): string {
  return community?.name || community?.host || communityId
}

/** Die Mitgliedschaften EINES Runtime-Users, projektgenau und vollständig. */
async function listOwnMemberships(
  event: H3Event,
  runtimeProjectId: string,
  runtimeUserId: string,
): Promise<CommunityMemberRow[]> {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const admin = createAdminClient(event)
  return await listAllRows<CommunityMemberRow>(admin.tablesDB, databaseId, COMMUNITY_MEMBERS_TABLE, [
    Query.equal('runtimeProjectId', runtimeProjectId),
    Query.equal('runtimeUserId', runtimeUserId),
    Query.orderAsc('$createdAt'),
  ])
}

/**
 * Einladungen an EINE Adresse — auf das rufende Projekt eingegrenzt.
 *
 * `community_invites` trägt keine `runtimeProjectId` (zur Einladungszeit gibt es
 * noch keinen Runtime-User), also läuft die Eingrenzung über die Community.
 * Beide Schreibweisen werden gesucht: eingeladen wird kleingeschrieben
 * (invite.post.ts normalisiert), aber Bestand aus früheren Wegen kann anders
 * aussehen.
 */
async function listInvitesForEmail(
  event: H3Event,
  runtimeProjectId: string,
  email: string,
  loadCommunity: (id: string) => Promise<TenantRow | null>,
): Promise<CommunityInviteRow[]> {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const admin = createAdminClient(event)
  const spellings = [...new Set([email, email.trim().toLowerCase()])]

  const rows = await listAllRows<CommunityInviteRow>(admin.tablesDB, databaseId, COMMUNITY_INVITES_TABLE, [
    Query.equal('email', spellings),
    Query.orderAsc('$createdAt'),
  ])

  const mine: CommunityInviteRow[] = []
  for (const row of rows) {
    const community = await loadCommunity(row.communityId)
    // Community weg = Einladung ins Leere: gehört ebenfalls diesem Aufräumen
    // (die Adresse steht trotzdem drin). Fremdes Projekt = nicht unsere Sache.
    if (community && community.projectId !== runtimeProjectId) continue
    mine.push(row)
  }
  return mine
}

/**
 * DSGVO-AUSKUNFT: was das Control Plane über diese Person führt.
 *
 * Ohne Adresse (unbestätigte oder schon entfernte E-Mail) bleiben die
 * Einladungen leer — sie sind ausschließlich über die Adresse auffindbar, und
 * eine geratene wäre eine Auskunft über jemand anders.
 */
export async function exportCommunityUserData(
  event: H3Event,
  runtimeProjectId: string,
  runtimeUserId: string,
  email: string,
): Promise<CommunityUserDataExport> {
  const loadCommunity = communityLoader(event)

  const rows = await listOwnMemberships(event, runtimeProjectId, runtimeUserId)
  const memberships: CommunityMembershipExport[] = []
  for (const row of rows) {
    const community = await loadCommunity(row.communityId)
    memberships.push({
      communityId: row.communityId,
      communityName: communityLabel(community, row.communityId),
      host: community?.host ?? '',
      role: row.role,
      status: row.status,
      joinedAt: row.$createdAt,
      removedAt: row.removedAt ?? null,
    })
  }

  const invites: CommunityInviteExport[] = []
  if (email) {
    for (const row of await listInvitesForEmail(event, runtimeProjectId, email, loadCommunity)) {
      const community = await loadCommunity(row.communityId)
      invites.push({
        communityId: row.communityId,
        communityName: communityLabel(community, row.communityId),
        role: row.role,
        status: row.status,
        expiresAt: row.expiresAt,
        createdAt: row.$createdAt,
      })
    }
  }

  return { memberships, invites }
}

/**
 * DSGVO-LÖSCHUNG: alle Mitgliedschaften dieses Runtime-Users auflösen und die
 * Einladungen an seine Adresse entfernen.
 *
 * IDEMPOTENT, weil der Orchestrator einen Re-Run nach Teilfehler vorsieht:
 * gelöschte Zeilen sind beim zweiten Lauf nicht mehr da, und eine bereits
 * anonymisierte Zeile (`email === ''`) wird nicht noch einmal geschrieben.
 *
 * FEHLER WERDEN NICHT GESCHLUCKT. `deleteUserCompletely` gated `users.delete()`
 * auf den Voll-Erfolg aller Contributors — ein stillgelegter Fehler hier wäre
 * genau die Lücke, die dieses Gate verhindern soll.
 */
export async function eraseCommunityUserData(
  event: H3Event,
  runtimeProjectId: string,
  runtimeUserId: string,
  email: string,
): Promise<CommunityErasureResult> {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const admin = createAdminClient(event)
  const loadCommunity = communityLoader(event)

  const rows = await listOwnMemberships(event, runtimeProjectId, runtimeUserId)
  const retained: RetainedMembership[] = []
  let deleted = 0
  let anonymized = 0

  for (const row of rows) {
    const community = await loadCommunity(row.communityId)
    // Community weg (Row gelöscht) ⇒ die Mitgliedschaft schützt nichts mehr.
    // Die Owner-Zählung braucht ALLE Zeilen DIESER Community, nicht nur die
    // eigene — sonst wäre jeder Owner „der letzte".
    const members = community
      ? await listCommunityMembers(event, row.communityId, runtimeProjectId)
      : [row]
    const decision = decideMembershipErasure({
      target: memberFacts(row),
      members: members.map(memberFacts),
      communityStatus: community?.status ?? 'disabled',
    })

    if (decision.action === 'delete') {
      await admin.tablesDB.deleteRow({ databaseId, tableId: COMMUNITY_MEMBERS_TABLE, rowId: row.$id })
      deleted++
      continue
    }

    retained.push({
      communityId: row.communityId,
      communityName: communityLabel(community, row.communityId),
      role: row.role,
      reason: 'last_owner',
    })
    if (row.email === '') continue // schon entpersonalisiert (Re-Run)
    await admin.tablesDB.updateRow<CommunityMemberRow>({
      databaseId, tableId: COMMUNITY_MEMBERS_TABLE, rowId: row.$id, data: { email: '' },
    })
    anonymized++
  }

  let invitesDeleted = 0
  if (email) {
    for (const invite of await listInvitesForEmail(event, runtimeProjectId, email, loadCommunity)) {
      // HART GELÖSCHT, nicht auf 'revoked' gesetzt: der Personenbezug einer
      // Einladung IST die Adresse — eine Zeile ohne sie hätte keinen Zweck
      // mehr (der Token-Hash ist ohne Empfänger wertlos).
      await admin.tablesDB.deleteRow({ databaseId, tableId: COMMUNITY_INVITES_TABLE, rowId: invite.$id })
      invitesDeleted++
    }
  }

  return { deleted, anonymized, invitesDeleted, retained }
}
