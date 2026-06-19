import { ID, Permission, Role } from 'node-appwrite'
import { commentSchema } from '../../../schemas/comment'
import { COMMENTS_TABLE, type Comment } from '../../../shared/types/comment'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const appConfig = await getAppConfig(event)
  if (!appConfig.commentsEnabled || appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Commenting is currently disabled' })
  }

  const body = await readValidatedBody(event, commentSchema.parse)
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const row = await tablesDB.createRow<Comment>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMENTS_TABLE,
    rowId: ID.unique(),
    data: {
      targetId: body.targetId,
      targetType: body.targetType,
      content: body.content,
      parentId: body.parentId ?? null,
      authorId: user.$id,
      authorName: user.name,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      status: 'active',
    },
    // Lesen erlaubt die Table (any) — ändern/löschen nur der Autor
    permissions: [
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  })

  // Antwort auf einen Kommentar → den Autor des Eltern-Kommentars benachrichtigen
  if (body.parentId) {
    try {
      const parent = await tablesDB.getRow<Comment>({
        databaseId: config.public.appwriteDatabaseId,
        tableId: COMMENTS_TABLE,
        rowId: body.parentId,
      })
      if (parent.authorId && parent.authorId !== user.$id) {
        const admin = createAdminClient(event)
        const snippet = body.content.length > 140 ? `${body.content.slice(0, 140)}…` : body.content
        await admin.tablesDB.createRow({
          databaseId: config.public.appwriteDatabaseId,
          tableId: 'notifications',
          rowId: ID.unique(),
          data: {
            recipientId: parent.authorId,
            type: 'reply',
            title: user.name,
            body: snippet,
            link: '/',
            read: false,
          },
          permissions: [
            Permission.read(Role.user(parent.authorId)),
            Permission.update(Role.user(parent.authorId)),
          ],
        })
      }
    }
    catch {
      // Benachrichtigung ist best effort — Kommentar wurde bereits erstellt
    }
  }

  setResponseStatus(event, 201)
  return row
})
