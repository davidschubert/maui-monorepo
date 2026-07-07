import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { POLL_VOTES_TABLE, POSTS_TABLE, type CommunityPost, type PollVote } from '../../shared/types/post'

/**
 * GDPR-Contributor des posts-Layers (Vertrag: core/server/utils/userData.ts).
 *
 * Posts → TOMBSTONE statt Hard-Delete (wie comments): eine Poll mit fremden
 * Stimmen oder eine Frage mit Antworten ist Gesprächskontext anderer — Inhalt,
 * Titel und Autor werden geblankt, status 'deleted', Leserecht entzogen.
 * poll_votes → Hard-Delete (reine Verhaltens-Daten des Users).
 */
export async function postsExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const posts = await listAllRows<CommunityPost>(tablesDB, databaseId, POSTS_TABLE, [Query.equal('authorId', userId)])
  const votes = await listAllRows<PollVote>(tablesDB, databaseId, POLL_VOTES_TABLE, [Query.equal('userId', userId)])

  return {
    posts: posts.map(p => ({
      type: p.type, title: p.title, body: p.body, status: p.status,
      scheduledAt: p.scheduledAt, publishedAt: p.publishedAt,
      pollOptions: p.pollOptions, createdAt: p.$createdAt,
    })),
    pollVotes: votes.map(v => ({ postId: v.postId, optionIndex: v.optionIndex, createdAt: v.$createdAt })),
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

  // Eigene Posts: Tombstone (idempotent — bereits geblankte überspringen)
  const posts = await listAllRows<CommunityPost>(tablesDB, databaseId, POSTS_TABLE, [Query.equal('authorId', userId)])
  for (const post of posts) {
    if (post.status === 'deleted' && post.body === '' && post.authorName === '') continue
    await tablesDB.updateRow({
      databaseId,
      tableId: POSTS_TABLE,
      rowId: post.$id,
      data: { status: 'deleted', title: null, body: '', authorName: '' },
      // niemand liest mehr; keine User-Rechte übrig (der Account verschwindet)
      permissions: [Permission.read(Role.label('admin'))],
    })
    anonymized++
  }

  return { deleted, anonymized }
}
