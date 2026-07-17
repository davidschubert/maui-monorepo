import type { H3Event } from 'h3'
import { verifyEntitlementDocument } from './entitlementDocument'

/**
 * Entitlement-Pull (F3/M8-Vorbereitung): holt das signierte Dokument vom
 * Control Plane (NUXT_ENTITLEMENTS_URL), prüft es und persistiert NUR
 * verifizierte Dokumente in app_config.entitlements (system-019). Ein
 * fehlgeschlagener Pull lässt das gespeicherte Dokument stehen —
 * last-known-good trägt bis graceUntil (Grace-Semantik in featureGates).
 * Geteilt zwischen Intervall-Plugin und POST /api/platform/entitlements/
 * refresh (system.manage).
 */

export interface EntitlementsPullResult {
  status: 'disabled' | 'updated' | 'unchanged' | 'error'
  detail?: string
}

export async function runEntitlementsPull(event?: H3Event): Promise<EntitlementsPullResult> {
  const config = useRuntimeConfig(event)
  if (!config.entitlementsUrl) return { status: 'disabled' }

  const keys = parseEntitlementPublicKeys(config.entitlementsPublicKeys)
  if (!Object.keys(keys).length) {
    return { status: 'error', detail: 'NUXT_ENTITLEMENTS_PUBLIC_KEYS fehlt/unlesbar' }
  }

  let raw: string
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(config.entitlementsUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return { status: 'error', detail: `HTTP ${res.status}` }
    raw = (await res.text()).trim()
  }
  catch (error) {
    return { status: 'error', detail: (error as Error).message }
  }

  const verified = verifyEntitlementDocument(raw, keys, config.public.appwriteProjectId)
  if (!verified.ok) {
    // Unverifizierbares wird NIE gespeichert — last-known-good bleibt stehen
    return { status: 'error', detail: `Dokument ungültig: ${verified.reason}` }
  }

  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const current = await getAppConfig(event)
  if (current.entitlementsDoc === raw) return { status: 'unchanged' }

  try {
    await admin.tablesDB.updateRow({
      databaseId, tableId: 'app_config', rowId: 'global',
      data: { entitlements: raw },
    })
  }
  catch (error) {
    if ((error as { code?: number })?.code === 404) {
      await admin.tablesDB.createRow({
        databaseId, tableId: 'app_config', rowId: 'global',
        data: { entitlements: raw },
      }).catch((inner) => { throw inner })
    }
    else {
      return { status: 'error', detail: (error as Error).message }
    }
  }

  invalidateFeatureGateCache()
  return {
    status: 'updated',
    detail: `features: ${verified.payload.features.join(', ') || '—'}${verified.payload.suspended ? ' · SUSPENDED' : ''}`,
  }
}
