import { ID, Permission, Query, Role } from 'node-appwrite'
import { commentSchema } from '../../../schemas/comment'
import { COMMENTS_TABLE, MAX_COMMENT_DEPTH, type Comment } from '../../../shared/types/comment'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  await assertCommentsWritable(event)

  const body = await readValidatedBody(event, commentSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)

  // Bei einer Antwort: Eltern-Kommentar vorab holen → rootId/depth ableiten,
  // maxDepth prüfen und den Parent für die Notification wiederverwenden.
  let parent: Comment | null = null
  let rootId: string | null = null
  let depth = 0
  if (body.parentId) {
    parent = await tablesDB.getRow<Comment>({ databaseId, tableId: COMMENTS_TABLE, rowId: body.parentId })
      .catch(() => null)
    if (!parent) {
      throw createError({ status: 404, statusText: 'Parent comment not found' })
    }
    rootId = parent.rootId ?? parent.$id
    depth = parent.depth + 1
    if (depth > MAX_COMMENT_DEPTH) {
      throw createError({ status: 422, statusText: 'Maximum reply depth reached' })
    }
  }

  const row = await tablesDB.createRow<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    rowId: ID.unique(),
    data: {
      targetId: body.targetId,
      targetType: body.targetType,
      content: body.content,
      parentId: body.parentId ?? null,
      targetUrl: body.targetUrl ?? null,
      rootId,
      depth,
      editedAt: null,
      authorId: user.$id,
      authorName: user.name,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      status: 'active',
    },
    // Lesen erlaubt die ROW (any) — nicht mehr die Table: hidden-Kommentare
    // verlieren beim Ausblenden ihre read(any)-Row-Permission und sind damit
    // auch per Roh-REST/Web-SDK unlesbar (Migration 008). Gast-Realtime läuft
    // über die Row-Permission weiter. Ändern/löschen nur der Autor.
    permissions: [
      Permission.read(Role.any()),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  }).catch((error) => {
    // Appwrite-4xx (z. B. abgelaufene Session) als 4xx durchreichen, nicht als 500
    throw toH3Error(error, 'Could not create comment')
  })

  const snippet = body.content.length > 140 ? `${body.content.slice(0, 140)}…` : body.content
  // Link zur echten Seite des Kommentars: targetUrl des Replies (= Seite),
  // sonst die des Parents, sonst '/' (Bestandskommentare ohne targetUrl).
  const link = (body.targetUrl ?? parent?.targetUrl) ?? '/'

  // Antwort auf einen Kommentar → den Autor des Eltern-Kommentars benachrichtigen.
  // Core stellt den notify()-Vertrag bereit (best-effort, wirft nicht) — kein
  // direkter Cross-Layer-Zugriff auf die notifications-Tabelle (CONCEPT A14).
  if (parent && parent.authorId && parent.authorId !== user.$id) {
    await notify(event, { recipientId: parent.authorId, type: 'reply', title: user.name, body: snippet, link, senderId: user.$id })
  }

  // @Name-Erwähnungen (aufgelöst gegen die Thread-Teilnehmer) benachrichtigen —
  // sich selbst nie, den Parent-Autor nicht doppelt (hat schon die reply-Notif).
  const mentions = await resolveMentions(event, {
    targetId: body.targetId,
    targetType: body.targetType,
    content: body.content,
    excludeUserIds: [user.$id, ...(parent?.authorId ? [parent.authorId] : [])],
  })
  for (const mention of mentions) {
    await notify(event, { recipientId: mention.userId, type: 'mention', title: user.name, body: snippet, link, senderId: user.$id })
  }

  // Activity-Feed (Core-Vertrag recordActivity, best-effort wie notify) —
  // packages/feed rendert daraus „{name} hat einen Kommentar geschrieben"
  // (feed.types.comment.created); kein Import aus feed (CONCEPT A14).
  await recordActivity(event, {
    actorId: user.$id,
    actorName: user.name,
    type: 'comment.created',
    objectType: 'comment',
    objectId: row.$id,
    link,
    metadata: { snippet },
  })
  // Meilenstein („1.000 Kommentare") — ein billiger Count (limit 1 → total),
  // best-effort über den Core-Vertrag
  const commentTotal = await tablesDB.listRows({
    databaseId, tableId: COMMENTS_TABLE, queries: [Query.limit(1)],
  }).then(r => r.total).catch(() => 0)
  await maybeRecordMilestone(event, { type: 'milestone.comments', count: commentTotal, link })

  setResponseStatus(event, 201)
  // Avatar des Autors mitgeben (analog zur Listen-Anreicherung), damit der
  // optimistisch eingefügte Kommentar nach dem Reconcile das Bild behält
  const avatarUrl = (user.prefs as { avatarUrl?: string })?.avatarUrl
  return { ...row, authorAvatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined }
})
