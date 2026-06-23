import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { ChangelogEntry, ChangelogListResponse } from '../../shared/types/admin'

type Row = Models.Row & Omit<ChangelogEntry, '$id' | '$createdAt'>

/** Öffentlich: veröffentlichte Changelog-Einträge für die „Was ist neu"-Ansicht. */
export default defineEventHandler(async (event): Promise<ChangelogListResponse> => {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  try {
    const res = await admin.tablesDB.listRows<Row>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'changelog',
      queries: [Query.equal('published', true), Query.orderDesc('date'), Query.limit(20)],
    })
    return {
      total: res.total,
      entries: res.rows.map(r => ({
        $id: r.$id, $createdAt: r.$createdAt, date: r.date ?? r.$createdAt, title: r.title, body: r.body,
        titleEn: r.titleEn ?? '', bodyEn: r.bodyEn ?? '',
        category: r.category ?? '', version: r.version ?? '', published: r.published,
      })),
    }
  }
  catch {
    return { total: 0, entries: [] }
  }
})
