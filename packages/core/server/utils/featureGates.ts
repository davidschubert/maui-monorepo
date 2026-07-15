import type { H3Event } from 'h3'
import type { FeatureRuntimeState } from '../../shared/types/config'

/**
 * Effektive Feature-Gates (F2) — verallgemeinert das getEffectiveAiConfig-
 * Muster: enabled(key) = einkompiliert (Registry) ∧ app_config.features[key]
 * nicht abgeschaltet. Fehlender DB-Eintrag = AN (kompiliert = von der Site
 * gewollt, Site-Manifest). Entitlements (F3) docken ab M6/M8 als dritte
 * UND-Bedingung hier an — Konsumenten bleiben unverändert.
 *
 * Kleiner TTL-Cache (5 s): die Middleware fragt pro API-Request — ein
 * DB-Read pro Request wäre Verschwendung, und die UI reagiert ohnehin über
 * den Realtime-Kanal sofort. Toggle-Wirkung am Server ≤ 5 s ist akzeptiert.
 * In-memory/instanz-lokal wie das Rate-Limit (Multi-Instanz: Redis-Thema).
 */

const CACHE_TTL_MS = 5_000
let cache: { at: number, features: Record<string, FeatureRuntimeState> } | null = null

/** Test-/Admin-Hook: Cache verwerfen (z. B. direkt nach einem Toggle). */
export function invalidateFeatureGateCache(): void {
  cache = null
}

async function getRuntimeFeatureStates(event: H3Event): Promise<Record<string, FeatureRuntimeState>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.features
  const config = await getAppConfig(event)
  cache = { at: Date.now(), features: config.features }
  return config.features
}

/** Effektiver Zustand EINES Features (nur einkompilierte kommen vor). */
export async function isFeatureEnabled(event: H3Event, key: string): Promise<boolean> {
  if (!getFeatureRegistry().has(key)) return false
  const states = await getRuntimeFeatureStates(event)
  const state = states[key]
  return state ? state.enabled && state.status === 'active' : true
}

/**
 * Route-Guard: Feature aus ⇒ 404 (bewusst kein 403 — ob ein deaktiviertes
 * Feature existiert, geht Anonyme nichts an).
 */
export async function requireFeature(event: H3Event, key: string): Promise<void> {
  if (!(await isFeatureEnabled(event, key))) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
}

/**
 * Effektive Zustände ALLER einkompilierten Features (Katalog/Admin-Seite):
 * Registry-Reihenfolge, DB-Override angewendet.
 */
export async function getEffectiveFeatures(event: H3Event): Promise<Record<string, FeatureRuntimeState>> {
  const states = await getRuntimeFeatureStates(event)
  const result: Record<string, FeatureRuntimeState> = {}
  for (const key of getFeatureRegistry().keys()) {
    result[key] = states[key] ?? { enabled: true, status: 'active' }
  }
  return result
}
