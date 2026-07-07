import { ID, Permission, Query, Role } from 'node-appwrite'
import { postSchema } from '../../../schemas/post'
import { POSTS_TABLE, type CommunityPost } from '../../../shared/types/post'

/**
 * Post/Poll/Frage erstellen — member-led: JEDER eingeloggte User (Plan P5).
 * Schutz: Rate-Limit (Core-Middleware, Bucket posts:create), Zod-Limits,
 * Wartungsmodus-Gate. Mit scheduledAt → status 'scheduled' (nur der Autor
 * sieht die Row — kein read(any) bis zum Publish).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  const body = await readValidatedBody(event, postSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)

  const scheduled = !!body.scheduledAt
  const now = new Date().toISOString()

  const row = await tablesDB.createRow<CommunityPost>({
    databaseId,
    tableId: POSTS_TABLE,
    rowId: ID.unique(),
    data: {
      type: body.type,
      title: body.title || null,
      body: body.body,
      authorId: user.$id,
      authorName: user.name,
      status: scheduled ? 'scheduled' : 'published',
      scheduledAt: body.scheduledAt ?? null,
      publishedAt: scheduled ? null : now,
      pollOptions: body.type === 'poll' ? JSON.stringify(body.pollOptions) : null,
      pollEndsAt: body.type === 'poll' ? (body.pollEndsAt ?? null) : null,
      upvotes: 0,
      downvotes: 0,
      score: 0,
    },
    // published: alle lesen (hidden entzieht das wieder); scheduled: nur der
    // Autor liest — Publish-on-read fügt read(any) beim Fälligwerden hinzu.
    permissions: [
      ...(scheduled ? [Permission.read(Role.user(user.$id))] : [POST_READ_ANY]),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  }).catch((error) => {
    throw toH3Error(error, 'Could not create post')
  })

  if (!scheduled) {
    // Activity-Feed + Meilenstein (Core-Verträge, best-effort)
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'post.published',
      objectType: 'post',
      objectId: row.$id,
      link: '/community',
      metadata: { snippet: row.title || row.body.slice(0, 140) },
    })
    const total = await tablesDB.listRows({
      databaseId, tableId: POSTS_TABLE, queries: [Query.limit(1)],
    }).then(r => r.total).catch(() => 0)
    await maybeRecordMilestone(event, { type: 'milestone.posts', count: total, link: '/community' })
  }

  setResponseStatus(event, 201)
  const avatarUrl = (user.prefs as { avatarUrl?: string })?.avatarUrl
  return { ...row, authorAvatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined }
})
