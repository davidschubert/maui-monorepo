import { z } from 'zod'

const configSchema = z.object({
  registrationEnabled: z.boolean(),
  commentsEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
})

/** Feature-Flags setzen (Upsert der app_config/global-Zeile) + Audit. */
export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const data = await readValidatedBody(event, configSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  try {
    await admin.tablesDB.updateRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
  }
  catch {
    // Zeile fehlt noch → anlegen
    await admin.tablesDB.createRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
  }

  await recordAudit(event, { action: 'config.updated', targetType: 'config', targetId: 'global', metadata: data })

  return data
})
