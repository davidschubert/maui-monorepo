import { ID } from 'node-appwrite'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  category: z.enum(['feature', 'improvement', 'fix']).default('feature'),
  version: z.string().max(30).default(''),
  published: z.boolean().default(true),
  date: z.string().optional(),
})

/** Admin: neuen Changelog-Eintrag anlegen. */
export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const input = await readValidatedBody(event, schema.parse)
  const data = { ...input, date: input.date || new Date().toISOString() }
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.createRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'changelog',
    rowId: ID.unique(),
    data,
  })

  await recordAudit(event, { action: 'changelog.created', targetType: 'changelog', targetId: row.$id, targetName: data.title })
  return row
})
