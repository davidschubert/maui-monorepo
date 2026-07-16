import { SITES_TABLE, type SiteRow, type HealthStatus } from '../../../../../shared/types/site'

/**
 * Health-Check einer registrierten Site (sites.manage, L6-Grundstein):
 * prüft den Appwrite-Endpoint (/health/version) und — falls hinterlegt —
 * die App-URL. ok = beides erreichbar · degraded = eines von beiden ·
 * down = nichts. Persistiert healthStatus + healthCheckedAt.
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

export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing site id' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const site = await admin.tablesDB.getRow<SiteRow>({ databaseId, tableId: SITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Site not found') })

  const apiOk = await probe(`${site.endpoint.replace(/\/$/, '')}/health/version`)
  const appOk = site.appUrl ? await probe(site.appUrl) : null

  const healthStatus: HealthStatus = apiOk && appOk !== false
    ? 'ok'
    : apiOk || appOk ? 'degraded' : 'down'

  const healthCheckedAt = new Date().toISOString()
  await admin.tablesDB.updateRow({
    databaseId, tableId: SITES_TABLE, rowId: id,
    data: { healthStatus, healthCheckedAt },
  }).catch((error) => { throw toH3Error(error, 'Could not persist health status') })

  return { id, healthStatus, healthCheckedAt, apiOk, appOk }
})
