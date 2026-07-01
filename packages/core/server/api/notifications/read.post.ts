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

  // Direkt nach UNGELESENEN filtern und seitenweise abarbeiten — vorher holte
  // die Route eine willkürliche 100er-Seite ALLER Notifications: ab >100
  // blieben Ungelesene übrig und der Badge ging nie auf 0. Kein offset nötig:
  // jede Runde markiert ihre Treffer, die nächste list() sieht nur den Rest.
  let marked = 0
  for (let round = 0; round < 20; round++) {
    const res = await tablesDB.listRows<Models.Row & { read: boolean }>({
      databaseId,
      tableId: 'notifications',
      // recipientId-Filter als Defense-in-Depth zusätzlich zur Row-Security
      queries: [
        Query.equal('recipientId', event.context.user.$id),
        Query.equal('read', false),
        Query.limit(100),
      ],
    }).catch(() => ({ rows: [] as (Models.Row & { read: boolean })[] }))
    if (res.rows.length === 0) break

    await Promise.all(res.rows.map(r =>
      tablesDB.updateRow({ databaseId, tableId: 'notifications', rowId: r.$id, data: { read: true } }).catch(() => {}),
    ))
    marked += res.rows.length
    if (res.rows.length < 100) break
  }

  return { ok: true, marked }
})
