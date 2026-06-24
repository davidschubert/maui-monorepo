import { ID } from 'node-appwrite'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  titleEn: z.string().max(200).default(''),
  bodyEn: z.string().max(5000).default(''),
  category: z.enum(['feature', 'improvement', 'fix']).default('feature'),
  version: z.string().max(30).default(''),
  published: z.boolean().default(true),
  // ISO-Datetime erzwingen → eine ungültige date-Form wird sauber als 400
  // abgewiesen statt als unmaskierter 500 aus der Appwrite-datetime-Spalte.
  date: z.string().datetime().optional(),
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
