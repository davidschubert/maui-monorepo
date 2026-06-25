import { AppwriteException } from 'node-appwrite'
import { z } from 'zod'

const configSchema = z.object({
  registrationEnabled: z.boolean(),
  commentsEnabled: z.boolean(),
  maintenanceMode: z.boolean(),
})

/** Feature-Flags setzen (Upsert der app_config/global-Zeile) + Audit. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const data = await readValidatedBody(event, configSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  try {
    await admin.tablesDB.updateRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
  }
  catch (error) {
    // NUR wenn die Zeile fehlt anlegen — andere Fehler nicht verschlucken
    // (sonst 409 vom Create, der den echten Fehler maskiert).
    if (error instanceof AppwriteException && error.code === 404) {
      await admin.tablesDB.createRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
    }
    else {
      throw createError({ status: 500, statusText: 'Could not save configuration' })
    }
  }

  await recordAudit(event, { action: 'config.updated', targetType: 'config', targetId: 'global', metadata: data })

  return data
})
