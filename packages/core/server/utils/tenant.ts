import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { TenantContext } from '../../shared/types/tenant'

/**
 * Horizont-3 Naht 3 — mandanten-agnostischer Datenzugriff (RUHEND).
 * docs/plans/HORIZONT-3-POOL-SILO-BLUEPRINT.md, validiert in spikes/s5-pool-silo.
 *
 * Feature-Code ruft `listRows({ queries: scopeQuery(event, [...]) })` und
 * `createRow({ data: scopeRow(event, {...}) })`. Ohne Tenant-Kontext (heute)
 * und im Silo-Modus sind beide No-Ops → Verhalten unverändert. Im Pool-Modus
 * erzwingen sie den `tenantId`-Filter/-Wert (das Sicherheitsnetz zusätzlich zu
 * den Row-Permissions).
 */

/** Tenant des Requests — gesetzt von server/middleware/00.tenant.ts (Naht 1),
 *  null im Single-Tenant-Betrieb (Gate aus / kein Resolver). */
export function useTenant(event: H3Event): TenantContext | null {
  return event.context.tenant ?? null
}

// ── PURE Kern (unit-testbar, ohne h3) ───────────────────────────────────────

/** Queries mandanten-scopen: Pool hängt den tenantId-Filter an, sonst unverändert. */
export function scopeQueriesFor(tenant: TenantContext | null, queries: string[] = []): string[] {
  if (tenant?.mode === 'pool') return [...queries, Query.equal('tenantId', tenant.tenantId)]
  return [...queries]
}

/** Row-Daten mandanten-scopen: Pool setzt tenantId, sonst unverändert. */
export function scopeRowFor<T extends Record<string, unknown>>(
  tenant: TenantContext | null,
  data: T,
): T & { tenantId?: string } {
  if (tenant?.mode === 'pool') return { ...data, tenantId: tenant.tenantId }
  return { ...data }
}

// ── event-Wrapper (das, was Feature-Code aufruft) ───────────────────────────

export function scopeQuery(event: H3Event, queries: string[] = []): string[] {
  return scopeQueriesFor(useTenant(event), queries)
}

export function scopeRow<T extends Record<string, unknown>>(event: H3Event, data: T): T & { tenantId?: string } {
  return scopeRowFor(useTenant(event), data)
}
