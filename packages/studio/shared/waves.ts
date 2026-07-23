import type { TenantRow, TenantWave } from './types/tenantRecord'

/**
 * H3-4.2 Wellen-Migrationen (Blueprint L5): Silo-Schema-Updates rollen in
 * drei Wellen aus — internal (eigene Test-Tenants) → canary (wenige
 * Freiwillige) → stable (Rest). PURE Auswahl-Logik, vom Wellen-Runner
 * (scripts/migrate.mjs --wave) über packages/studio/scripts/
 * list-silo-tenants.ts benutzt und unit-getestet.
 *
 * Regeln:
 * - Nur SILO-Tenants zählen — Pool-Tenants teilen EIN Projekt, das der
 *   Runner separat genau einmal migriert (ihre wave-Spalte ist wirkungslos).
 * - '' (Bestand vor studio-012) gilt als 'stable' (konservativste Welle).
 * - disabled-Tenants migrieren MIT: ein abgeschalteter Host kommt wieder —
 *   dann muss sein Schema aktuell sein.
 * - projectIds werden dedupliziert (mehrere Hosts können auf ein Projekt
 *   zeigen) und deterministisch sortiert.
 */
export type WaveTenant = Pick<TenantRow, 'mode' | 'projectId' | 'wave'>

export function siloProjectsForWave(tenants: WaveTenant[], wave: TenantWave): string[] {
  const projects = new Set<string>()
  for (const tenant of tenants) {
    if (tenant.mode !== 'silo' || !tenant.projectId) continue
    const effective: TenantWave = tenant.wave === '' ? 'stable' : tenant.wave
    if (effective === wave) projects.add(tenant.projectId)
  }
  return [...projects].sort()
}
