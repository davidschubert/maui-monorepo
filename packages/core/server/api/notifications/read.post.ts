import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { createSessionClient } from '../../lib/appwrite'

/** Alle eigenen ungelesenen Benachrichtigungen als gelesen markieren. */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)

  const res = await tablesDB.listRows<Models.Row & { read: boolean }>({
    databaseId,
    tableId: 'notifications',
    queries: [Query.limit(100)],
  }).catch(() => ({ rows: [] as (Models.Row & { read: boolean })[] }))

  const unread = res.rows.filter(r => !r.read)
  await Promise.all(unread.map(r =>
    tablesDB.updateRow({ databaseId, tableId: 'notifications', rowId: r.$id, data: { read: true } }).catch(() => {}),
  ))

  return { ok: true, marked: unread.length }
})
