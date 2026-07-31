import { Permission, Role } from 'node-appwrite'
import { commentSchema } from '../../../schemas/comment'
import { COMMENTS_TABLE, MAX_COMMENT_DEPTH, type Comment } from '../../../shared/types/comment'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  await assertCommentsWritable(event)
  // H3-4.3: Pool-Tenants dürfen den geteilten Server nicht erschöpfen —
  // Limits aus pukalani.tenancy.quota (Core-Default aus), Silo/Single-Tenant no-op.
  await assertPoolWriteQuota(event, { kind: 'comments', tableId: COMMENTS_TABLE })

  const body = await readValidatedBody(event, commentSchema.parse)

  // Operator-Targets (pukalani.comments.operatorTargets, z. B. 'ticket'): nur
  // Operatoren dürfen schreiben, und die Rows sind NICHT read(any), sondern
  // nur für admin/moderator lesbar — interne Diskussionen bleiben intern.
  const appConfig = useAppConfig() as { pukalani?: { comments?: { operatorTargets?: string[] } } }
  const operatorTarget = (appConfig.pukalani?.comments?.operatorTargets ?? []).includes(body.targetType)
  if (operatorTarget) requirePermission(event, 'dashboard.access')

  // Operator-Rows tragen Role.label-Permissions — die kann nur der Admin-Client
  // setzen (Session-User dürfen fremde Label-Rollen nicht vergeben). Beide
  // Türklinken scopen identisch; nur der Client dahinter unterscheidet sich.
  const db = tenantDb(event, { as: operatorTarget ? 'operator' : 'member' })

  // Bei einer Antwort: Eltern-Kommentar vorab holen → rootId/depth ableiten,
  // maxDepth prüfen und den Parent für die Notification wiederverwenden.
  // `get` der Tür stellt zugleich sicher, dass die Antwort nicht an den
  // Kommentar eines FREMDEN Mandanten gehängt wird.
  let parent: Comment | null = null
  let rootId: string | null = null
  let depth = 0
  if (body.parentId) {
    parent = await db.get<Comment>(COMMENTS_TABLE, body.parentId, 'Parent comment not found')
    rootId = parent.rootId ?? parent.$id
    depth = parent.depth + 1
    if (depth > MAX_COMMENT_DEPTH) {
      throw createError({ status: 422, statusText: 'Maximum reply depth reached' })
    }
  }

  // Die tenantId stempelt die Tür — deshalb steht sie hier nicht.
  const row = await db.create<Comment>(COMMENTS_TABLE, {
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
  }, {
    // Eigene Permissions statt des Standard-Publikums: Kommentare sind
    // BEWUSST read(any) — der Embed-Fall zeigt Threads auf fremden Seiten,
    // auch Gästen. Ausblenden entzieht die Row-Permission (Migration 008),
    // damit ist ein hidden-Kommentar auch per Roh-REST unlesbar. Ändern und
    // löschen darf nur der Autor. Operator-Targets sehen NUR admin/moderator.
    permissions: [
      ...(operatorTarget
        ? [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))]
        : [Permission.read(Role.any())]),
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
  // scope 'tenant' (C15): die Meldung gehört in die Community, in der der
  // Kommentar steht — ihr Link (targetUrl) gilt auch nur dort.
  if (parent && parent.authorId && parent.authorId !== user.$id) {
    await notify(event, { recipientId: parent.authorId, type: 'reply', title: user.name, body: snippet, link, senderId: user.$id, scope: 'tenant' })
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
    await notify(event, { recipientId: mention.userId, type: 'mention', title: user.name, body: snippet, link, senderId: user.$id, scope: 'tenant' })
  }

  // Activity-Feed (Core-Vertrag recordActivity, best-effort wie notify) —
  // packages/activity rendert daraus „{name} hat einen Kommentar geschrieben"
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
  // Durch die Tür zählt der Meilenstein die Kommentare DIESER Community —
  // vorher war es die Gesamtzahl über alle Mandanten, und Kunde B hätte den
  // „1.000 Kommentare"-Moment von Kunde A gefeiert.
  const commentTotal = await db.count(COMMENTS_TABLE).catch(() => 0)
  await maybeRecordMilestone(event, { type: 'milestone.comments', count: commentTotal, link })

  setResponseStatus(event, 201)
  // Avatar des Autors mitgeben (analog zur Listen-Anreicherung), damit der
  // optimistisch eingefügte Kommentar nach dem Reconcile das Bild behält
  const avatarUrl = (user.prefs as { avatarUrl?: string })?.avatarUrl
  return { ...row, authorAvatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined }
})
