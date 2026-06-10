import { ID, Permission, Role } from 'node-appwrite'
import { commentSchema } from '../../../schemas/comment'
import { COMMENTS_TABLE, type Comment } from '../../../shared/types/comment'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const body = await readValidatedBody(event, commentSchema.parse)
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const row = await tablesDB.createRow<Comment>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMENTS_TABLE,
    rowId: ID.unique(),
    data: {
      postId: body.postId,
      text: body.text,
      parentId: body.parentId ?? null,
      authorId: user.$id,
      authorName: user.name,
      status: 'visible',
    },
    // Lesen erlaubt die Table (any) — ändern/löschen nur der Autor
    permissions: [
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  })

  setResponseStatus(event, 201)
  return row
})
