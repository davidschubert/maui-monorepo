import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000).optional(),
  category: z.enum(['feature', 'improvement', 'fix']).optional(),
  version: z.string().max(30).optional(),
  published: z.boolean().optional(),
})

/** Admin: Changelog-Eintrag bearbeiten. */
export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const data = await readValidatedBody(event, schema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.updateRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'changelog',
    rowId: id,
    data,
  })

  await recordAudit(event, { action: 'changelog.updated', targetType: 'changelog', targetId: id, targetName: String(data.title ?? '') })
  return row
})
