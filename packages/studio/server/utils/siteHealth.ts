import { Query } from 'node-appwrite'
import { SITES_TABLE, type HealthStatus, type SiteRow } from '../../shared/types/site'

/**
 * Health-Check + Feature-Snapshot einer registrierten Site (M6-T1/T4,
 * L6-Grundstein) — geteilt zwischen der manuellen Route
 * (POST /api/studio/sites/:id/health) und dem Intervall-Sweep
 * (server/plugins/health-sweep.ts). Probt den Appwrite-Endpoint
 * (/health/version) und — falls hinterlegt — die App-URL; von einer
 * erreichbaren App wird zusätzlich GET /api/platform/features gelesen
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

async function fetchFeatureSnapshot(appUrl: string): Promise<string[] | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${appUrl.replace(/\/$/, '')}/api/platform/features`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = await res.json() as { features?: unknown }
    if (!Array.isArray(json.features)) return null
    return json.features.filter((key): key is string => typeof key === 'string').slice(0, 30)
  }
  catch {
    return null
  }
}

export interface SiteHealthResult {
  id: string
  healthStatus: HealthStatus
  healthCheckedAt: string
  apiOk: boolean
  appOk: boolean | null
  /** Aktive Feature-Keys der Site — null, wenn nicht abrufbar (Snapshot bleibt dann stehen). */
  features: string[] | null
  changed: boolean
}

type AdminClient = ReturnType<typeof createAdminClient>

/** Prüft EINE Site und persistiert healthStatus/healthCheckedAt/features. */
export async function checkSiteHealth(admin: AdminClient, databaseId: string, site: SiteRow): Promise<SiteHealthResult> {
  const apiOk = await probe(`${site.endpoint.replace(/\/$/, '')}/health/version`)
  const appOk = site.appUrl ? await probe(site.appUrl) : null
  const features = site.appUrl && appOk ? await fetchFeatureSnapshot(site.appUrl) : null

  const healthStatus: HealthStatus = apiOk && appOk !== false
    ? 'ok'
    : apiOk || appOk ? 'degraded' : 'down'
  const healthCheckedAt = new Date().toISOString()

  await admin.tablesDB.updateRow({
    databaseId, tableId: SITES_TABLE, rowId: site.$id,
    data: {
      healthStatus,
      healthCheckedAt,
      // Snapshot nur bei erfolgreichem Abruf überschreiben — eine kurz nicht
      // erreichbare App löscht nicht das letzte bekannte Feature-Set
      ...(features !== null ? { features: JSON.stringify(features.sort()) } : {}),
    },
  })

  return { id: site.$id, healthStatus, healthCheckedAt, apiOk, appOk, features, changed: healthStatus !== site.healthStatus }
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

  const { rows } = await admin.tablesDB.listRows<SiteRow>({
    databaseId, tableId: SITES_TABLE, queries: [Query.limit(100)],
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
