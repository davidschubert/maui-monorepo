import { z } from 'zod'
import { TENANT_PLANS, TENANT_PLANS_TABLE, parseTenantPlanLimits, type TenantPlanRow } from '../../../../shared/types/tenantRecord'

// Limits je kind: ganze Zahlen ≥ 0 (0 = unbegrenzt), Obergrenze als
// Tippfehler-Schutz. Kinds bewusst offen (heute 'comments', später mehr) —
// aber nur kleine Wort-Keys, kein Injection-/Aufbläh-Spielraum.
const limitsSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9-]{0,29}$/),
  z.object({
    perDay: z.number().int().min(0).max(10_000_000).optional(),
    total: z.number().int().min(0).max(1_000_000_000).optional(),
  }),
)

/** Betreiber: Quota-Limits eines Plans ändern — wirkt im Pool nach ≤ 90 s
 *  (Katalog-Cache 60 s + Host-Cache 30 s im platform-Resolver). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const param = getRouterParam(event, 'key')
  const key = TENANT_PLANS.find(plan => plan === param)
  if (!key) {
    throw createError({ status: 404, statusText: 'Unknown plan' })
  }

  const limits = await readValidatedBody(event, limitsSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  // rowId = key (studio-014-Seed) — upsert-artig: fehlt die Row (z. B. neuer
  // Plan-Key nach Migration), wird sie angelegt
  const row = await admin.tablesDB.upsertRow<TenantPlanRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANT_PLANS_TABLE,
    rowId: key,
    data: { key, limits: JSON.stringify(limits) },
  }).catch((error) => { throw toH3Error(error, 'Could not update tenant plan') })

  return { key: row.key, limits: parseTenantPlanLimits(row.limits) }
})
