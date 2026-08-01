import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  decideMembershipErasure,
  inviteReferenceErasure,
  type CommunityErasureResult,
  type CommunityInviteExport,
  type CommunityMembershipExport,
  type CommunityUserDataExport,
  type InviteRequestExport,
  type RetainedMembership,
} from '../../shared/communityTeam'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'
import { COMMUNITY_INVITES_TABLE, type CommunityInviteRow } from '../../shared/types/communityInvite'
import { INVITE_REQUESTS_TABLE, type InviteRequestRow } from '../../shared/types/inviteRequest'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { listCommunityMembers, memberFacts } from './communityTeam'

/**
 * F3 — DSGVO-Auskunft und -Löschung für die Zeilen, die das CONTROL PLANE über
 * einen Runtime-Nutzer führt: seine Mitgliedschaften (`community_members`), die
 * Einladungen an seine Adresse (`community_invites`), die SPUREN, die er in
 * fremden Einladungen hinterlassen hat, und seine Early-Access-Anfrage
 * (`invite_requests`).
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
 * Einladungen, die eine SPUR dieses Kontos tragen — `invitedBy` (er hat
 * eingeladen) oder `acceptedBy` (er hat angenommen). Das sind FREMDE Zeilen:
 * sie gehören der eingeladenen Adresse und bleiben bestehen, nur der Verweis
 * auf das gelöschte Konto fällt weg.
 *
 * Zwei Abfragen statt einer — Appwrite kennt kein ODER über zwei Spalten. Ein
 * Index dafür gibt es bewusst nicht: die bestehende Adress-Abfrage läuft
 * ebenfalls nur über einen Teil-Index, die Tabelle ist klein, und der Vorgang
 * ist eine Kontolöschung, kein Anzeige-Pfad. Doppelte Treffer (eine Zeile trägt
 * beide Felder) sammelt die Map ein, damit nur EIN Update rausgeht.
 *
 * Gescopt wird wie bei `listInvitesForEmail` über die Community: fremdes
 * Projekt überspringen, gelöschte Community zählt als unsere.
 */
async function listInviteReferences(
  event: H3Event,
  runtimeProjectId: string,
  runtimeUserId: string,
  loadCommunity: (id: string) => Promise<TenantRow | null>,
): Promise<CommunityInviteRow[]> {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const admin = createAdminClient(event)
  const mine = new Map<string, CommunityInviteRow>()

  for (const field of ['invitedBy', 'acceptedBy'] as const) {
    const rows = await listAllRows<CommunityInviteRow>(admin.tablesDB, databaseId, COMMUNITY_INVITES_TABLE, [
      Query.equal(field, runtimeUserId),
      Query.orderAsc('$createdAt'),
    ])
    for (const row of rows) {
      if (mine.has(row.$id)) continue
      const community = await loadCommunity(row.communityId)
      if (community && community.projectId !== runtimeProjectId) continue
      mine.set(row.$id, row)
    }
  }

  return [...mine.values()]
}

/**
 * Die Early-Access-Anfrage(n) zu EINER Adresse.
 *
 * `invite_requests` trägt KEINE Projekt-Spalte — die Anfrage entsteht, bevor es
 * irgendeine Community gibt, und der Trichter ist der Betreiber-Trichter.
 * Gescopt wird deshalb allein über die BESTÄTIGTE Adresse (eine unbestätigte
 * geht gar nicht erst mit, siehe `erasureIdentity` im onboarding-Layer), und
 * praktisch ruft nur die Pool-App diese Naht — der Contributor lebt im
 * onboarding-Layer, den eine Silo-App nicht hat.
 *
 * Beide Schreibweisen wie bei den Einladungen: die Anfrage-Route normalisiert
 * kleingeschrieben, Bestand kann anders aussehen.
 */
async function listInviteRequestsForEmail(event: H3Event, email: string): Promise<InviteRequestRow[]> {
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  const admin = createAdminClient(event)
  const spellings = [...new Set([email, email.trim().toLowerCase()])]

  return await listAllRows<InviteRequestRow>(admin.tablesDB, databaseId, INVITE_REQUESTS_TABLE, [
    Query.equal('email', spellings),
    Query.orderAsc('$createdAt'),
  ])
}

/**
 * DSGVO-AUSKUNFT: was das Control Plane über diese Person führt.
 *
 * Ohne Adresse (unbestätigte oder schon entfernte E-Mail) bleiben die
 * Einladungen UND die Early-Access-Anfragen leer — beide sind ausschließlich
 * über die Adresse auffindbar, und eine geratene wäre eine Auskunft über jemand
 * anders.
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
  const inviteRequests: InviteRequestExport[] = []
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

    for (const row of await listInviteRequestsForEmail(event, email)) {
      inviteRequests.push({ status: row.status, note: row.note, createdAt: row.$createdAt })
    }
  }

  return { memberships, invites, inviteRequests }
}

/**
 * DSGVO-LÖSCHUNG: alle Mitgliedschaften dieses Runtime-Users auflösen, die
 * Einladungen an seine Adresse und seine Early-Access-Anfragen entfernen, und
 * die Spuren kappen, die er in FREMDEN Einladungen hinterlassen hat.
 *
 * IDEMPOTENT, weil der Orchestrator einen Re-Run nach Teilfehler vorsieht:
 * gelöschte Zeilen sind beim zweiten Lauf nicht mehr da, eine bereits
 * anonymisierte Zeile (`email === ''`) wird nicht noch einmal geschrieben, und
 * eine gekappte Spur (`invitedBy`/`acceptedBy` auf `''`) findet die Abfrage
 * `Query.equal(field, runtimeUserId)` nicht mehr.
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
  let inviteRequestsDeleted = 0
  if (email) {
    for (const invite of await listInvitesForEmail(event, runtimeProjectId, email, loadCommunity)) {
      // HART GELÖSCHT, nicht auf 'revoked' gesetzt: der Personenbezug einer
      // Einladung IST die Adresse — eine Zeile ohne sie hätte keinen Zweck
      // mehr (der Token-Hash ist ohne Empfänger wertlos).
      await admin.tablesDB.deleteRow({ databaseId, tableId: COMMUNITY_INVITES_TABLE, rowId: invite.$id })
      invitesDeleted++
    }

    for (const request of await listInviteRequestsForEmail(event, email)) {
      // EBENFALLS HART: der Personenbezug einer Anfrage ist die Adresse PLUS
      // der Freitext („Wofür willst du Pukalani nutzen?") — nach beidem bliebe
      // von der Zeile nur ein Statuswort übrig. Der Prune-Sweep räumt bewusst
      // nur 'declined' (30 d) und 'redeemed' (90 d) ab; eine offene Anfrage
      // läge sonst unbegrenzt da, gerade weil auf sie noch niemand geantwortet
      // hat.
      await admin.tablesDB.deleteRow({ databaseId, tableId: INVITE_REQUESTS_TABLE, rowId: request.$id })
      inviteRequestsDeleted++
    }
  }

  // ZULETZT die Spuren in FREMDEN Einladungen — nach dem Löschschritt, damit
  // Zeilen, die ohnehin verschwinden, hier gar nicht erst auftauchen.
  let invitesAnonymized = 0
  for (const invite of await listInviteReferences(event, runtimeProjectId, runtimeUserId, loadCommunity)) {
    const patch = inviteReferenceErasure(invite, runtimeUserId)
    if (!patch) continue // Re-Run: schon gekappt
    await admin.tablesDB.updateRow<CommunityInviteRow>({
      databaseId, tableId: COMMUNITY_INVITES_TABLE, rowId: invite.$id, data: patch,
    })
    invitesAnonymized++
  }

  return { deleted, anonymized, invitesDeleted, invitesAnonymized, inviteRequestsDeleted, retained }
}
