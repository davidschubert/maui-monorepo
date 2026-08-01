import type { H3Event } from 'h3'
import { verifyEntitlementDocument } from './entitlementDocument'
import {
  getEntitlementsDocument,
  storeEntitlementsDocument,
} from './entitlementsStore'

/**
 * Entitlement-Pull (F3/M8-Vorbereitung): holt das signierte Dokument vom
 * Control Plane (NUXT_ENTITLEMENTS_URL), prüft es und persistiert NUR
 * verifizierte Dokumente in app_secrets.entitlements (system-020, server-only
 * — Audit-Befund N2). Ein fehlgeschlagener Pull lässt das gespeicherte
 * Dokument stehen — last-known-good trägt bis graceUntil (Grace-Semantik in
 * productGates). Geteilt zwischen Intervall-Plugin und POST
 * /api/platform/entitlements/refresh (system.manage).
 *
 * BIS 2026-07-31 räumte jeder Lauf zusätzlich die read(any)-Altspalte
 * app_config.entitlements (system-019) leer. Das ist erledigt: die Spalte hat
 * keinen Leser mehr (entitlementsStore) und fällt mit system-027 ganz weg
 * (OPEN-ITEMS C6). Deshalb ist „unchanged" wieder die einfache Frage, ob sich
 * das Dokument geändert hat.
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

  const current = await getEntitlementsDocument(event)
  if (current === raw) return { status: 'unchanged' }

  try {
    await storeEntitlementsDocument(event, raw)
  }
  catch (error) {
    return { status: 'error', detail: (error as Error).message }
  }

  invalidateProductGateCache()
  return {
    status: 'updated',
    detail: `products: ${verified.payload.products.join(', ') || '—'}${verified.payload.suspended ? ' · SUSPENDED' : ''}`,
  }
}
