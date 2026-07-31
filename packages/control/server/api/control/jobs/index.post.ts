import { ID, Query } from 'node-appwrite'
import { z } from 'zod'
import { PRODUCT_CATALOG_TABLE, JOBS_TABLE, type ProductCatalogRow, type SiteCreateJobPayload } from '../../../../shared/types/job'
import { WEBSITES_TABLE } from '../../../../shared/types/website'

const createJobSchema = z.object({
  type: z.literal('site.create'),
  name: z.string().regex(/^[a-z][a-z0-9-]*$/).min(2).max(30),
  products: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).min(0).max(20),
  port: z.number().int().min(3002).max(3999).optional(),
}).strict()

/**
 * Provisionierungs-Job anlegen (sites.manage) — M6-T2: „create-site als Job
 * hinter der UI". Der Web-Prozess validiert und BESCHREIBT nur (§ 8);
 * ausgeführt wird repo-seitig durch `pnpm control:jobs` (der die
 * Console-Credentials hält). Die finale Autorität über Produkte/requires
 * bleibt create-site selbst — hier nur Frühvalidierung fürs UI-Feedback.
 */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'sites.manage')

  const body = await readValidatedBody(event, createJobSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // Frühvalidierung gegen den gesyncten Katalog (leer = Runner lief noch nie)
  const { rows: catalog } = await admin.tablesDB.listRows<ProductCatalogRow>({
    databaseId, tableId: PRODUCT_CATALOG_TABLE, queries: [Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not load product catalog') })
  if (!catalog.length) {
    throw createError({ status: 409, statusText: 'Produkt catalog empty — run the job runner once (pnpm control:jobs)' })
  }

  // Wählbar: alles außer core/system (implizit immer dabei) und studio
  // (läuft nur auf der Control-Site) — foundation-Tier wie themes/admin ist
  // pro Site wählbar, nur nicht zubuchbar (F7).
  const NOT_SELECTABLE = ['core', 'system', 'control']
  const byKey = new Map(catalog.map(row => [row.$id, row]))
  for (const product of body.products) {
    const entry = byKey.get(product)
    if (!entry || NOT_SELECTABLE.includes(product)) {
      throw createError({ status: 400, statusText: `Unknown or non-selectable product: ${product}` })
    }
    for (const required of JSON.parse(entry.requires || '[]') as string[]) {
      if (!body.products.includes(required)) {
        throw createError({ status: 400, statusText: `Product "${product}" requires "${required}"` })
      }
    }
  }

  // Duplikate: bereits registrierte Site (Slug) oder offener Job gleichen Namens
  const [{ total: slugTaken }, { rows: openJobs }] = await Promise.all([
    admin.tablesDB.listRows({
      databaseId, tableId: WEBSITES_TABLE,
      queries: [Query.equal('slug', body.name), Query.limit(1)],
    }),
    admin.tablesDB.listRows({
      databaseId, tableId: JOBS_TABLE,
      queries: [Query.equal('status', ['queued', 'running']), Query.limit(100)],
    }),
  ]).catch((error) => { throw toH3Error(error, 'Could not check for duplicates') })

  if (slugTaken > 0) {
    throw createError({ status: 409, statusText: 'A site with this name is already registered' })
  }
  if (openJobs.some(job => (JSON.parse((job as { payload?: string }).payload ?? '{}') as SiteCreateJobPayload).name === body.name)) {
    throw createError({ status: 409, statusText: 'A job for this name is already queued or running' })
  }

  const payload: SiteCreateJobPayload = { name: body.name, products: body.products, ...(body.port ? { port: body.port } : {}) }
  const row = await admin.tablesDB.createRow({
    databaseId, tableId: JOBS_TABLE, rowId: ID.unique(),
    data: {
      type: body.type,
      payload: JSON.stringify(payload),
      status: 'queued',
      requestedBy: user.$id,
    },
  }).catch((error) => { throw toH3Error(error, 'Could not create job') })

  setResponseStatus(event, 201)
  return { id: row.$id }
})
