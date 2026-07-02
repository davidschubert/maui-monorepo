import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { COMMENTS_TABLE, VOTES_TABLE, type Comment, type CommentVote } from '../../shared/types/comment'

/**
 * GDPR-Contributor des comments-Layers (Vertrag: core/server/utils/userData.ts).
 *
 * Export: alle Kommentare + Votes des Users (vollständig paginiert).
 * Löschung: Kommentare werden zum TOMBSTONE anonymisiert (Row-Erasure —
 * `authorId/authorName/content` leer, `status: 'deleted'`), NICHT hart
 * gelöscht: Hard-Delete würde Threads zerreißen (parentId/rootId fremder
 * Antworten) und die Antworten ANDERER User sind deren Daten. Der leere
 * Sentinel wird von der UI als „[gelöscht]" gerendert. Votes werden hart
 * gelöscht; die denormalisierten Zähler bleiben (Aggregate ohne
 * Personenbezug, Selbstheilung beim nächsten Vote). Plan §4.4, E1/E2.
 */

export function commentsExportUserData(event: H3Event, userId: string) {
  return exportData(event, userId)
}

async function exportData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [comments, votes] = await Promise.all([
    listAllRows<Comment>(tablesDB, databaseId, COMMENTS_TABLE, [Query.equal('authorId', userId)]),
    listAllRows<CommentVote>(tablesDB, databaseId, VOTES_TABLE, [Query.equal('userId', userId)]),
  ])

  return {
    comments: comments.map(r => ({
      id: r.$id,
      createdAt: r.$createdAt,
      content: r.content,
      targetType: r.targetType,
      targetId: r.targetId,
      status: r.status,
    })),
    votes: votes.map(r => ({
      commentId: r.commentId,
      value: r.value,
      createdAt: r.$createdAt,
    })),
  }
}

export async function commentsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // Kommentare → Tombstone (Row-Erasure). Nach dem Update matcht die Row den
  // authorId-Filter nicht mehr → Re-Run findet leere Seiten (idempotent).
  const comments = await listAllRows<Comment>(tablesDB, databaseId, COMMENTS_TABLE, [Query.equal('authorId', userId)])
  for (const row of comments) {
    await tablesDB.updateRow({
      databaseId,
      tableId: COMMENTS_TABLE,
      rowId: row.$id,
      data: { authorId: '', authorName: '', content: '', status: 'deleted', editedAt: null },
      // Owner-Permissions (update/delete des Ex-Users) abräumen; read(any)
      // bleibt — der Tombstone ist öffentlich sichtbar, enthält aber keine PII.
      permissions: [Permission.read(Role.any())],
    })
  }

  // Votes → Hard-Delete
  const votes = await listAllRows<CommentVote>(tablesDB, databaseId, VOTES_TABLE, [Query.equal('userId', userId)])
  for (const row of votes) {
    await tablesDB.deleteRow({ databaseId, tableId: VOTES_TABLE, rowId: row.$id })
  }

  return { deleted: votes.length, anonymized: comments.length }
}
