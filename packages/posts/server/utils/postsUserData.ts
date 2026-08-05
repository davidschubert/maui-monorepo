import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { communityModeratorLabel } from '../../../core/shared/communityModeratorLabel'
import { MEMBER_COUNTERS_TABLE, POLL_VOTES_TABLE, POSTS_TABLE, POST_VOTES_TABLE, type CommunityPost, type MemberCounters, type PollVote, type PostVote } from '../../shared/types/post'

/**
 * GDPR-Contributor des posts-Layers (Vertrag: core/server/utils/userData.ts).
 *
 * Posts → TOMBSTONE statt Hard-Delete (wie comments): eine Poll mit fremden
 * Stimmen oder eine Frage mit Antworten ist Gesprächskontext anderer — Inhalt,
 * Titel und Autor werden geblankt, status 'deleted', Leserecht entzogen.
 * poll_votes → Hard-Delete (reine Verhaltens-Daten des Users).
 *
 * BEWUSST AUSSERHALB der Datentür (tenantDb): GDPR ist user-zentriert und
 * per Definition mandantenübergreifend — die Daten eines Users müssen über
 * ALLE Communities exportiert/gelöscht werden (CLAUDE.md, Ausnahmenliste).
 */

/**
 * Leserecht eines GRABSTEINS — je Zeile aus IHRER Community abgeleitet.
 *
 * Genau dieselbe Rechnung wie `tenantReadRolesFor(tenant, 'moderators')`, aber
 * eben NICHT über `useTenant(event)`: dieser Lauf geht über alle Communities
 * des Users, also gibt es keinen „Mandanten dieses Requests", dem man folgen
 * dürfte. Der aktuelle Host würde sonst sein Moderations-Label auf die
 * Grabsteine FREMDER Communities stempeln.
 *
 * Fällt eine Zeile ohne `communityId` an (Silo, Bestand vor der Migration),
 * gelten die globalen Betreiber-Rollen — dort IST das Projekt die Grenze.
 */
function tombstonePermissions(post: CommunityPost): string[] {
  const communityId = (post as { communityId?: unknown }).communityId
  const label = typeof communityId === 'string' ? communityModeratorLabel(communityId) : null
  if (label) return [Permission.read(Role.label(label))]
  return [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))]
}
export async function postsExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const posts = await listAllRows<CommunityPost>(tablesDB, databaseId, POSTS_TABLE, [Query.equal('authorId', userId)])
  const votes = await listAllRows<PollVote>(tablesDB, databaseId, POLL_VOTES_TABLE, [Query.equal('userId', userId)])
  // Degradiert auf leer, solange Migration 003 auf einer Instanz aussteht
  const postVotes = await listAllRows<PostVote>(tablesDB, databaseId, POST_VOTES_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as PostVote[])
  // Degradiert auf leer, solange posts-013 auf einer Instanz aussteht.
  const counters = await listAllRows<MemberCounters>(tablesDB, databaseId, MEMBER_COUNTERS_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as MemberCounters[])

  return {
    posts: posts.map(p => ({
      type: p.type, title: p.title, body: p.body, status: p.status,
      scheduledAt: p.scheduledAt, publishedAt: p.publishedAt,
      pollOptions: p.pollOptions, createdAt: p.$createdAt,
    })),
    pollVotes: votes.map(v => ({ postId: v.postId, optionIndex: v.optionIndex, createdAt: v.$createdAt })),
    postVotes: postVotes.map(v => ({ postId: v.postId, value: v.value, createdAt: v.$createdAt })),
    // F1: die mitschreibenden Zähler sind Zahlen ÜBER einen Menschen und
    // gehören deshalb in seine Auskunft — je Community eine Zeile.
    counters: counters.map(c => ({
      topicsCreated: c.topicsCreated, repliesCreated: c.repliesCreated,
      upvotesGiven: c.upvotesGiven, upvotesReceived: c.upvotesReceived,
      edits: c.edits, createdAt: c.$createdAt,
    })),
  }
}

export async function postsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0
  let anonymized = 0

  // Eigene Poll-Stimmen: Hard-Delete. STRIKT — deleteUserCompletely gated
  // users.delete auf Voll-Erfolg, ein geschluckter Fehler wäre eine Lücke.
  const votes = await listAllRows<PollVote>(tablesDB, databaseId, POLL_VOTES_TABLE, [Query.equal('userId', userId)])
  for (const vote of votes) {
    await tablesDB.deleteRow({ databaseId, tableId: POLL_VOTES_TABLE, rowId: vote.$id })
    deleted++
  }

  // Up-/Downvotes ebenso Hard-Delete (Zähler-Drift bis zum nächsten Vote
  // akzeptiert — Präzedenzfall comments). List degradiert vor Migration 003.
  const scoreVotes = await listAllRows<PostVote>(tablesDB, databaseId, POST_VOTES_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as PostVote[])
  for (const vote of scoreVotes) {
    await tablesDB.deleteRow({ databaseId, tableId: POST_VOTES_TABLE, rowId: vote.$id })
    deleted++
  }

  /**
   * F1: die mitschreibenden Zähler sind Hard-Delete.
   *
   * Anders als ein Beitrag sind sie kein Gesprächskontext anderer — es sind
   * Zahlen ÜBER genau diesen Menschen, und ohne ihn haben sie keinen
   * Gegenstand mehr. Ein Grabstein wäre hier sinnlos.
   *
   * Die Liste degradiert auf leer, solange posts-013 auf einer Instanz
   * aussteht; die Löschungen selbst sind STRIKT (Muster der Stimmen darüber),
   * weil `deleteUserCompletely` das Konto nur bei Voll-Erfolg entfernt.
   */
  const counters = await listAllRows<MemberCounters>(tablesDB, databaseId, MEMBER_COUNTERS_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as MemberCounters[])
  for (const row of counters) {
    await tablesDB.deleteRow({ databaseId, tableId: MEMBER_COUNTERS_TABLE, rowId: row.$id })
    deleted++
  }

  // Eigene Posts: Tombstone (idempotent — bereits geblankte überspringen)
  const posts = await listAllRows<CommunityPost>(tablesDB, databaseId, POSTS_TABLE, [Query.equal('authorId', userId)])
  for (const post of posts) {
    if (post.status === 'deleted' && post.body === '' && post.authorName === '') continue
    await tablesDB.updateRow({
      databaseId,
      tableId: POSTS_TABLE,
      rowId: post.$id,
      data: { status: 'deleted', title: null, body: '', authorName: '' },
      // Niemand liest mehr; keine User-Rechte übrig (der Account verschwindet).
      // WER BLEIBT ÜBRIG: die Moderation DIESER Community — nicht das globale
      // Betreiber-Label (Audit-Befund 2026-08-02). `read(label('admin'))` ist
      // instanz-weit; im Pool hätte damit jede fremde Community Leserecht auf
      // einen Grabstein, der von einem Menschen handelt. Der Inhalt ist zwar
      // geleert, die Metadaten (wann, in welchem Thread, welcher Typ) bleiben —
      // und für Zeilen, die über Menschen sprechen, ist die Projektregel
      // `read: 'moderators'` (core/server/utils/tenantRowPermissions.ts).
      permissions: tombstonePermissions(post),
    })
    anonymized++
  }

  return { deleted, anonymized }
}
