import type { H3Event } from 'h3'
import { verifyEntitlementDocument } from './entitlementDocument'
import {
  clearLegacyEntitlementsDocument,
  getEntitlementsDocument,
  getLegacyEntitlementsDocument,
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
 * Jeder Lauf räumt zusätzlich die Altspalte app_config.entitlements
 * (system-019): die Tabelle ist Table-read(any), das Dokument darf dort nicht
 * liegen bleiben. Das passiert AUCH, wenn sich das Dokument nicht geändert hat
 * — sonst bliebe ein unveränderter Wert dort ewig stehen.
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

  const [current, legacy] = await Promise.all([
    getEntitlementsDocument(event),
    getLegacyEntitlementsDocument(event),
  ])
  // Aufräum-Bedingung: solange die read(any)-Altspalte noch etwas trägt, ist
  // der Lauf nie „unchanged" — er muss mindestens einmal schreiben+räumen.
  if (current === raw && !legacy) return { status: 'unchanged' }

  try {
    await storeEntitlementsDocument(event, raw)
  }
  catch (error) {
    return { status: 'error', detail: (error as Error).message }
  }
  if (legacy) await clearLegacyEntitlementsDocument(event)

  invalidateProductGateCache()
  return {
    status: 'updated',
    detail: `products: ${verified.payload.products.join(', ') || '—'}${verified.payload.suspended ? ' · SUSPENDED' : ''}`,
  }
}
