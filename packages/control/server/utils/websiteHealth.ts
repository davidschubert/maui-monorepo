import { Query } from 'node-appwrite'
import { WEBSITES_TABLE, type HealthStatus, type WebsiteRow } from '../../shared/types/website'

/**
 * Health-Check + Produkt-Snapshot einer registrierten Site (M6-T1/T4,
 * L6-Grundstein) — geteilt zwischen der manuellen Route
 * (POST /api/control/websites/:id/health) und dem Intervall-Sweep
 * (server/plugins/health-sweep.ts). Probt den Appwrite-Endpoint
 * (/health/version) und — falls hinterlegt — die App-URL; von einer
 * erreichbaren App wird zusätzlich GET /api/platform/products gelesen
 * (öffentliche Core-Route; § 8: Studio hält keine Site-Keys).
 * ok = beides erreichbar · degraded = eines · down = nichts.
 */

async function probe(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    clearTimeout(timer)
    return res.ok
  }
  catch {
    return false
  }
}

async function fetchSnapshotRoute(url: string, field: 'products' | 'features'): Promise<string[] | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = await res.json() as Record<string, unknown>
    const list = json[field]
    if (!Array.isArray(list)) return null
    return list.filter((key): key is string => typeof key === 'string').slice(0, 30)
  }
  catch {
    return null
  }
}

async function fetchProductSnapshot(appUrl: string): Promise<string[] | null> {
  const base = appUrl.replace(/\/$/, '')
  // Übergang bis zum Zusammenziehen (E11): Silo-Apps ziehen per Update-Welle
  // nach — solange eine Site die neue Route nicht kennt, antwortet die alte
  // mit { features }. Der Fallback fällt mit dem Zusammenziehen weg.
  return await fetchSnapshotRoute(`${base}/api/platform/products`, 'products')
    ?? await fetchSnapshotRoute(`${base}/api/platform/features`, 'features')
}

export interface SiteHealthResult {
  id: string
  healthStatus: HealthStatus
  healthCheckedAt: string
  apiOk: boolean
  appOk: boolean | null
  /** Aktive Produkt-Keys der Site — null, wenn nicht abrufbar (Snapshot bleibt dann stehen). */
  products: string[] | null
  changed: boolean
}

type AdminClient = ReturnType<typeof createAdminClient>

/** Prüft EINE Site und persistiert healthStatus/healthCheckedAt/products. */
export async function checkSiteHealth(admin: AdminClient, databaseId: string, site: WebsiteRow): Promise<SiteHealthResult> {
  const apiOk = await probe(`${site.endpoint.replace(/\/$/, '')}/health/version`)
  const appOk = site.appUrl ? await probe(site.appUrl) : null
  const products = site.appUrl && appOk ? await fetchProductSnapshot(site.appUrl) : null

  const healthStatus: HealthStatus = apiOk && appOk !== false
    ? 'ok'
    : apiOk || appOk ? 'degraded' : 'down'
  const healthCheckedAt = new Date().toISOString()

  await admin.tablesDB.updateRow({
    databaseId, tableId: WEBSITES_TABLE, rowId: site.$id,
    data: {
      healthStatus,
      healthCheckedAt,
      // Snapshot nur bei erfolgreichem Abruf überschreiben — eine kurz nicht
      // erreichbare App löscht nicht das letzte bekannte Produkt-Set.
      // Übergang bis zum Zusammenziehen (E11): alte Spalte `features` wird
      // mitgeschrieben (Rollback-Pfad), fällt mit der Aufräum-Migration weg.
      ...(products !== null
        ? (() => { const snapshot = JSON.stringify(products.sort()); return { products: snapshot, features: snapshot } })()
        : {}),
    },
  })

  return { id: site.$id, healthStatus, healthCheckedAt, apiOk, appOk, products, changed: healthStatus !== site.healthStatus }
}

export interface HealthSweepResult {
  checked: number
  notOk: string[]
  changed: string[]
}

/** Sweep über ALLE registrierten Sites — Aufrufer ist das Intervall-Plugin (ohne Request-Kontext). */
export async function runHealthSweep(): Promise<HealthSweepResult> {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId

  const { rows } = await admin.tablesDB.listRows<WebsiteRow>({
    databaseId, tableId: WEBSITES_TABLE, queries: [Query.limit(100)],
  })

  const result: HealthSweepResult = { checked: 0, notOk: [], changed: [] }
  for (const site of rows) {
    const check = await checkSiteHealth(admin, databaseId, site).catch(() => null)
    if (!check) continue
    result.checked++
    if (check.healthStatus !== 'ok') result.notOk.push(`${site.slug}=${check.healthStatus}`)
    if (check.changed) result.changed.push(`${site.slug}→${check.healthStatus}`)
  }
  return result
}
