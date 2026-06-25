import type { Models } from 'node-appwrite'
import { z } from 'zod'

const schema = z.object({
  // Englisch = Hauptsprache: wenn gesetzt, nicht leer. Deutsch = optional.
  titleEn: z.string().min(1).max(200).optional(),
  bodyEn: z.string().min(1).max(5000).optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
  category: z.enum(['feature', 'improvement', 'fix']).optional(),
  version: z.string().max(30).optional(),
  published: z.boolean().optional(),
  // ISO-Datetime erzwingen → ungültige date-Form als 400 statt unmaskiertem 500
  date: z.string().datetime().optional(),
})

/** Admin: Changelog-Eintrag bearbeiten. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'changelog.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const data = await readValidatedBody(event, schema.parse)
  if (Object.keys(data).length === 0) {
    throw createError({ status: 400, statusText: 'No fields to update' })
  }
  // title/body (DE) sind in Appwrite Pflicht — leer gelassene DE-Felder aus dem
  // Englischen auffüllen, damit Deutsch optionale Alternative bleibt.
  if (data.titleEn !== undefined && !data.title) data.title = data.titleEn
  if (data.bodyEn !== undefined && !data.body) data.body = data.bodyEn
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.updateRow<Models.Row & { title?: string }>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'changelog',
    rowId: id,
    data,
  })

  // targetName aus der aktualisierten Row, nicht aus data.title — bei Teil-Edits
  // (z.B. nur published/date) fehlt title im Body und der Audit-Log bliebe leer.
  await recordAudit(event, { action: 'changelog.updated', targetType: 'changelog', targetId: id, targetName: row.title ?? '' })
  return row
})
