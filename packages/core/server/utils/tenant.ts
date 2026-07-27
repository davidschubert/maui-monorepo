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

/**
 * Cache-Scope für Microcaches (Cross-Tenant-Cache-Regel, H3): JEDER Microcache
 * auf einer tenancy-fähigen App MUSS den Tenant im Key tragen, sonst leakt
 * die Antwort von Kunde A an Kunde B (Pool: andere Datenzeilen; Silo: sogar
 * ein anderes Appwrite-Projekt). Single-Tenant-Betrieb → stabiler Key
 * 'single' (Verhalten unverändert).
 */
export function tenantCacheScopeFor(tenant: TenantContext | null): string {
  if (!tenant) return 'single'
  return tenant.mode === 'pool' ? `pool:${tenant.tenantId}` : `silo:${tenant.projectId}`
}

/**
 * Gehört diese Zeile dem Mandanten? PURE (unit-getestet).
 *
 * WARUM ES DAS BRAUCHT: `scopeQuery` schützt nur LISTEN. Wer eine Zeile per ID
 * mit dem ADMIN-Client lädt (`getRow`/`updateRow`/`deleteRow`), umgeht beides —
 * den Filter (keine Query) UND die Row-Permissions (der Admin-Client ist
 * absichtlich allmächtig). Ohne diese Prüfung könnte eine Moderatorin von
 * Community A mit einer ID aus Community B fremde Inhalte lesen oder
 * ausblenden. IDs sind nicht erratbar, aber sie sickern durch (Embeds, Links,
 * Screenshots) — „schwer zu erraten" ist keine Zugriffskontrolle.
 *
 * Fail-CLOSED: im Pool-Modus ohne `tenantId` an der Zeile (Bestand vor der
 * Migration) gilt sie als FREMD. Lieber ein 404 auf eine eigene Altzeile als
 * ein Treffer auf eine fremde.
 */
export function rowBelongsToTenant(tenant: TenantContext | null, row: unknown): boolean {
  if (!row || typeof row !== 'object') return false
  // Silo/Single-Tenant: das Projekt ist die Grenze, jede Zeile gehört dazu.
  if (tenant?.mode !== 'pool') return true
  // `unknown` statt eines engen Row-Typs: die Zeilen kommen aus dem SDK und
  // tragen je Layer andere Typen. Ein enger Parameter-Typ hätte an jeder
  // Aufrufstelle einen Cast erzwungen — und ein Cast ist genau die Stelle, an
  // der so eine Prüfung später versehentlich weggeräumt wird.
  const tenantId = (row as { tenantId?: unknown }).tenantId
  return typeof tenantId === 'string' && tenantId !== '' && tenantId === tenant.tenantId
}

/**
 * Darf sich auf DIESEM Host jeder ein Konto anlegen? PURE (unit-getestet).
 *
 * `null` (kein Mandanten-Kontext: Silo-App, Kontroll-Host, Playground) → ja.
 * Diese Deployments haben keine Community-Grenze, ihre Registrierung regelt
 * weiterhin `app_config.registrationEnabled` — der Schalter hier ist bewusst
 * NUR die Mandanten-Ebene und darf Bestands-Apps nicht anfassen.
 * `openRegistration === undefined` (Fixture/älterer Resolver) → ebenfalls ja.
 */
export function registrationOpenFor(tenant: TenantContext | null): boolean {
  return tenant?.openRegistration !== false
}

// ── event-Wrapper (das, was Feature-Code aufruft) ───────────────────────────

export function scopeQuery(event: H3Event, queries: string[] = []): string[] {
  return scopeQueriesFor(useTenant(event), queries)
}

export function tenantCacheScope(event: H3Event): string {
  return tenantCacheScopeFor(useTenant(event))
}

export function scopeRow<T extends Record<string, unknown>>(event: H3Event, data: T): T & { tenantId?: string } {
  return scopeRowFor(useTenant(event), data)
}

/**
 * Wache für den Zugriff PER ID mit dem Admin-Client. Wirft 404 — nicht 403:
 * ein 403 würde bestätigen, dass die Zeile existiert, und damit fremde IDs
 * verifizierbar machen. Für den Aufrufer sieht eine fremde Zeile genauso aus
 * wie eine, die es nicht gibt.
 *
 *   const row = await admin.tablesDB.getRow(…)
 *   assertTenantRow(event, row, 'Comment not found')
 */
export function assertTenantRow(event: H3Event, row: unknown, statusText = 'Not found'): void {
  if (rowBelongsToTenant(useTenant(event), row)) return
  throw createError({ status: 404, statusText })
}

/** Ist die Mitglieder-Registrierung dieses Mandanten offen? (S1) */
export function tenantRegistrationOpen(event: H3Event): boolean {
  return registrationOpenFor(useTenant(event))
}

/**
 * Wache für JEDE Route, die ein neues Konto anlegen kann (S1, Davids
 * Entscheidung 4). Die AUTORITÄT sitzt hier, nicht im UI: die Register-Seite
 * zeigt bei geschlossener Registrierung nur einen Hinweis, aber ein POST auf
 * /api/auth/signup umgeht jedes Markup.
 *
 * 403 mit einer NEUTRALEN, detailfreien Meldung: ob eine Community geschlossen
 * ist, ist keine Auskunft, die man an Fremde verteilt, und die lesbare Fassung
 * steht ohnehin lokalisiert auf der Seite (auth.register.inviteOnly*).
 */
export function assertTenantRegistrationOpen(event: H3Event): void {
  if (tenantRegistrationOpen(event)) return
  throw createError({ status: 403, statusText: 'Registration is closed' })
}
