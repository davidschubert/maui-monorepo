import type { TenantContext } from '../../shared/types/tenant'

/**
 * Horizont-3 Naht 1 — Resolver-Vertrag der Mandanten-Auflösung.
 *
 * Core kennt KEINE tenants-Tabelle (A14: die lebt im Control Plane / der
 * Platform-App). Stattdessen registriert die App per Nitro-Plugin einen
 * Resolver (Host → TenantContext), typischerweise tabellen-basiert + gecacht
 * (createMicrocache existiert dafür). Die Middleware 00.tenant.ts ruft ihn
 * nur bei aktivem maui.tenancy-Gate.
 */
export type TenantResolver = (host: string) => Promise<TenantContext | null> | TenantContext | null

let resolver: TenantResolver | null = null

/** Von der App (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerTenantResolver(fn: TenantResolver): void {
  if (resolver) console.warn('[core] registerTenantResolver: bestehender Resolver wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  resolver = fn
}

export function getTenantResolver(): TenantResolver | null {
  return resolver
}

/**
 * Host-Header normalisieren (pure, unit-getestet): Kleinschreibung, Port und
 * trailing dot weg. IPv6-Literale ([::1]:3000) behalten ihre Klammern.
 * Leerer/fehlender Header → '' (der Resolver entscheidet, was das bedeutet).
 */
export function normalizeHost(raw: string | undefined | null): string {
  if (!raw) return ''
  const trimmed = raw.trim().toLowerCase()
  // IPv6-Literal: Port folgt NACH der schließenden Klammer
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    return end === -1 ? trimmed : trimmed.slice(0, end + 1)
  }
  const withoutPort = trimmed.split(':')[0] ?? ''
  return withoutPort.endsWith('.') ? withoutPort.slice(0, -1) : withoutPort
}
