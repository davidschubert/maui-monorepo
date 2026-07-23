import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * H3-4.3 Quota-Enforcement (Blueprint S4): ein Pool-Kunde darf den geteilten
 * Server nicht erschöpfen. Core stellt den GENERISCHEN Baustein — welche
 * Tabelle ein Feature drosselt, sagt der FEATURE-Layer selbst beim Aufruf
 * (kein core→Feature-Coupling, A14):
 *
 *   await assertPoolWriteQuota(event, { kind: 'comments', tableId: COMMENTS_TABLE })
 *
 * Limits kommen aus app.config maui.tenancy.quota (Core-Default AUS; die
 * Platform-App aktiviert und setzt Zahlen):
 *
 *   maui: { tenancy: { quota: { enabled: true, comments: { perDay: 1000, total: 50_000 } } } }
 *
 * Semantik: greift NUR für Pool-Tenants (Silo = eigenes Projekt, erschöpft
 * niemanden mit). perDay = rollierende 24 h (kein Mitternachts-Reset-Gaming),
 * total = Bestand gesamt; 0/fehlend = unbegrenzt. Kosten: zwei indizierte
 * Count-Queries pro Schreibzugriff (idx_tenant, Single-Instanz ok) —
 * Überschreitung wirft 429.
 */

export interface TenantQuotaLimits {
  /** Schreibzugriffe in den letzten 24 h (rollierend); 0/fehlend = unbegrenzt. */
  perDay?: number
  /** Bestand gesamt; 0/fehlend = unbegrenzt. */
  total?: number
}

interface TenancyQuotaConfig {
  enabled?: boolean
  [kind: string]: TenantQuotaLimits | boolean | undefined
}

/** PURE Entscheidung (unit-getestet): welches Limit ist verletzt? */
export function evaluateQuota(
  counts: { day: number, total: number },
  limits: TenantQuotaLimits,
): 'ok' | 'total' | 'perDay' {
  if (limits.total && counts.total >= limits.total) return 'total'
  if (limits.perDay && counts.day >= limits.perDay) return 'perDay'
  return 'ok'
}

export async function assertPoolWriteQuota(event: H3Event, options: { kind: string, tableId: string }): Promise<void> {
  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool') return

  const appConfig = useAppConfig() as { maui?: { tenancy?: { quota?: TenancyQuotaConfig } } }
  const quota = appConfig.maui?.tenancy?.quota
  if (quota?.enabled !== true) return
  const limits = quota[options.kind]
  if (!limits || typeof limits === 'boolean') return

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const tenantFilter = Query.equal('tenantId', tenant.tenantId)
  const countQuery = (extra: string[] = []) => tablesDB.listRows({
    databaseId: config.public.appwriteDatabaseId,
    tableId: options.tableId,
    queries: [tenantFilter, ...extra, Query.limit(1)],
  }).then(r => r.total)

  const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [total, day] = await Promise.all([
    limits.total ? countQuery() : Promise.resolve(0),
    limits.perDay ? countQuery([Query.greaterThanEqual('$createdAt', dayStart)]) : Promise.resolve(0),
  ])

  const verdict = evaluateQuota({ day, total }, limits)
  if (verdict !== 'ok') {
    // 429 wie beim Rate-Limit; keine internen Zahlen an den Client leaken
    throw createError({ status: 429, statusText: verdict === 'total' ? 'Quota exceeded' : 'Daily quota exceeded' })
  }
}
