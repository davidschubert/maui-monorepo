import type { H3Event } from 'h3'
import type { FeatureRuntimeState } from '../../shared/types/config'
import { evaluateEntitlement, parseEntitlementPublicKeys, verifyEntitlementDocument, type EntitlementPayload } from './entitlementDocument'

/**
 * Effektive Feature-Gates (F2 + F3): enabled(key) = einkompiliert (Registry)
 * ∧ app_config.features[key] nicht abgeschaltet ∧ Entitlement lässt es zu
 * (dritte UND-Bedingung, M8-Vorbereitung). Fehlender DB-Eintrag = AN
 * (kompiliert = von der Site gewollt, Site-Manifest); fehlendes Entitlement-
 * Dokument = neutral AN (Enforcement beginnt mit dem ersten Pull). Ein
 * GESPEICHERTES, aber ungültiges Dokument schaltet optionale Features AUS —
 * ein gefälschtes Dokument wird nie toleriert (§ F3, 6. Runde).
 *
 * Kleiner TTL-Cache (5 s): die Middleware fragt pro API-Request — ein
 * DB-Read pro Request wäre Verschwendung, und die UI reagiert ohnehin über
 * den Realtime-Kanal sofort. Toggle-Wirkung am Server ≤ 5 s ist akzeptiert.
 * In-memory/instanz-lokal wie das Rate-Limit (Multi-Instanz: Redis-Thema).
 */

const CACHE_TTL_MS = 5_000

interface GateState {
  features: Record<string, FeatureRuntimeState>
  /** null = kein Dokument (neutral AN) · 'invalid' = gespeichert, aber nicht verifizierbar. */
  entitlement: EntitlementPayload | null | 'invalid'
}

let cache: { at: number, state: GateState } | null = null

/** Test-/Admin-Hook: Cache verwerfen (z. B. direkt nach einem Toggle/Pull). */
export function invalidateFeatureGateCache(): void {
  cache = null
}

async function getGateState(event: H3Event): Promise<GateState> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.state

  const appConfig = await getAppConfig(event)
  const runtime = useRuntimeConfig(event)

  let entitlement: GateState['entitlement'] = null
  if (appConfig.entitlementsDoc) {
    const result = verifyEntitlementDocument(
      appConfig.entitlementsDoc,
      parseEntitlementPublicKeys(runtime.entitlementsPublicKeys),
      runtime.public.appwriteProjectId,
    )
    if (result.ok) {
      entitlement = result.payload
    }
    else {
      entitlement = 'invalid'
      console.error(`[core] Entitlement-Dokument ungültig (${result.reason}) — optionale Features sind AUS`)
    }
  }

  const state: GateState = { features: appConfig.features, entitlement }
  cache = { at: Date.now(), state }
  return state
}

function entitlementAllows(state: GateState, key: string): boolean {
  const tier = getFeatureRegistry().get(key)?.tier ?? 'optional'
  if (state.entitlement === 'invalid') return tier === 'foundation'
  return evaluateEntitlement(state.entitlement, key, tier)
}

/** Effektiver Zustand EINES Features (nur einkompilierte kommen vor). */
export async function isFeatureEnabled(event: H3Event, key: string): Promise<boolean> {
  if (!getFeatureRegistry().has(key)) return false
  const state = await getGateState(event)
  const runtimeState = state.features[key]
  const runtimeOn = runtimeState ? runtimeState.enabled && runtimeState.status === 'active' : true
  return runtimeOn && entitlementAllows(state, key)
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
 * Registry-Reihenfolge, DB-Override UND Entitlement angewendet — blockt das
 * Entitlement, erscheint das Feature als disabled (wahrheitsgemäß wirksam).
 */
export async function getEffectiveFeatures(event: H3Event): Promise<Record<string, FeatureRuntimeState>> {
  const state = await getGateState(event)
  const result: Record<string, FeatureRuntimeState> = {}
  for (const key of getFeatureRegistry().keys()) {
    const runtimeState = state.features[key] ?? { enabled: true, status: 'active' as const }
    result[key] = entitlementAllows(state, key)
      ? runtimeState
      : { enabled: false, status: runtimeState.status }
  }
  return result
}
