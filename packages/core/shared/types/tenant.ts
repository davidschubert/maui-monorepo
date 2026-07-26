/**
 * Horizont-3 (Pool+Silo) — Mandanten-Kontext pro Request.
 * Siehe docs/plans/HORIZONT-3-POOL-SILO-BLUEPRINT.md (Naht 1).
 *
 * RUHEND: Heute setzt NICHTS `event.context.tenant` — ohne Kontext läuft alles
 * wie bisher (Single-Tenant pro Deployment). Der Typ + die Helfer stehen als
 * getestetes Fundament bereit; die Verdrahtung in die Client-Factories +
 * Auflösungs-Middleware kommt als eigener, bewusster Schritt.
 */
/**
 * `siteId` (G1): die kanonische Kunden-Site = tenants.$id (G0-Entscheidung
 * „der Tenant IST die Site"). Additiv/optional, weil Bestands-Fixtures +
 * Playground den Kontext ohne bauen; der reale tenants-Resolver setzt ihn aus
 * row.$id. requireTenantPermission verlangt ihn (fehlt er → fail-closed).
 */
/**
 * Branding des Mandanten (O5): das im Onboarding gewählte Built-in-Theme-Paar.
 *
 * MUSS am Mandanten hängen und nicht im Projekt: `app_config.themeSettings` ist
 * EINE Row pro Appwrite-Projekt — im Pool teilen sich alle Communities sie, ein
 * Schreiber hätte also alle anderen mit umgefärbt. Leer/fehlend = die
 * Instanz-Einstellung gilt weiter (heutiges Verhalten).
 */
export interface TenantBranding {
  theme?: string
  variant?: string
  /** Anzeigename des Mandanten (tenants.name) — trägt den öffentlichen
   *  Header der Community-Hosts („Morgenlicht" statt App-Brand). Reiner
   *  Text, wird NIE als Attribut/HTML interpoliert. */
  name?: string
}

export type TenantContext =
  /** Eigenes Appwrite-Projekt (Isolation am Projekt) — Spezial-/Enterprise-Kunde. */
  | ({ mode: 'silo', projectId: string, siteId?: string } & TenantBranding)
  /**
   * Geteiltes Projekt, Zeilen-Scope über tenantId — Standard-SaaS-Kunde.
   * `plan` (free/pro/business, Default free) staffelt die Quota — core bleibt
   * plan-name-agnostisch (nur ein String-Key in den quota.plans-Katalog).
   * `limits` (optional): vom Resolver bereits AUFGELÖSTE Quota-Limits je
   * kind (z. B. aus dem editierbaren tenant_plans-Katalog des Control Plane)
   * — hat Vorrang vor dem statischen app.config-Katalog (Fallback-Kette in
   * assertPoolWriteQuota).
   */
  | ({ mode: 'pool', projectId: string, tenantId: string, plan?: string, limits?: Record<string, { perDay?: number, total?: number }>, siteId?: string } & TenantBranding)
