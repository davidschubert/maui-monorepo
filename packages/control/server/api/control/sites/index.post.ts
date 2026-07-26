import { ID } from 'node-appwrite'
import { z } from 'zod'
import { SITES_TABLE } from '../../../../shared/types/site'

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/).max(64),
  projectId: z.string().regex(/^[a-z][a-z0-9-]*$/).max(64),
  endpoint: z.string().url().max(256),
  appUrl: z.string().url().max(256).optional().default(''),
  notes: z.string().max(1000).optional().default(''),
}).strict()

/**
 * Site im Register anlegen (sites.manage) — M6-T1: manuelle Registrierung
 * bestehender Sites; der Provisioner (M7) schreibt später über denselben
 * Vertrag mit Status provisioning → active.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const body = await readValidatedBody(event, registerSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.createRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: SITES_TABLE,
    rowId: ID.unique(),
    data: { ...body, status: 'active', healthStatus: 'unknown', healthCheckedAt: null },
  }).catch((error) => {
    if ((error as { code?: number })?.code === 409) {
      throw createError({ status: 409, statusText: 'Slug already registered' })
    }
    throw toH3Error(error, 'Could not register site')
  })

  setResponseStatus(event, 201)
  return { id: row.$id, slug: body.slug }
})
