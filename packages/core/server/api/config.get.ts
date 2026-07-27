import { toPublicAppConfig, type PublicAppConfig } from '../../shared/types/config'

/**
 * Öffentliche Laufzeit-Feature-Flags für den Client (z.B. Register-Gate).
 * Bewusst ohne Auth — die Flags sind nicht sensibel (Feature an/aus), und der
 * Server bleibt für jede Schreibaktion die eigentliche Autorität.
 *
 * Gibt NUR die client-sichtbare Teilmenge zurück (toPublicAppConfig,
 * Audit-Befund K5) — `entitlementsDoc` bleibt server-seitig. Vorher lieferte
 * diese unauthentifizierte Route das komplette signierte Entitlement-Dokument
 * im Klartext, und über den runtime-flags-State landete es zusätzlich im
 * __NUXT__-Payload jeder Seite.
 */
export default defineEventHandler(async (event): Promise<PublicAppConfig> =>
  toPublicAppConfig(await getAppConfig(event)))
