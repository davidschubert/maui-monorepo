import type { CommunitySuspension } from '../communitySuspension'

/**
 * Horizont-3 (Pool+Silo) — Mandanten-Kontext pro Request.
 * Siehe docs/referenz/HORIZONT-3-POOL-SILO-BLUEPRINT.md (Naht 1).
 *
 * RUHEND: Heute setzt NICHTS `event.context.tenant` — ohne Kontext läuft alles
 * wie bisher (Single-Tenant pro Deployment). Der Typ + die Helfer stehen als
 * getestetes Fundament bereit; die Verdrahtung in die Client-Factories +
 * Auflösungs-Middleware kommt als eigener, bewusster Schritt.
 */
/**
 * `communityId` (G1): die kanonische Kunden-Site = tenants.$id (G0-Entscheidung
 * „der Tenant IST die Site"). Additiv/optional, weil Bestands-Fixtures +
 * Playground den Kontext ohne bauen; der reale tenants-Resolver setzt ihn aus
 * row.$id. requireCommunityPermission verlangt ihn (fehlt er → fail-closed).
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
  /**
   * Neutral-Palette der Community (`data-neutral`, control-020) — eigene Achse
   * neben Theme/Variante. Davids Entscheidung vom 2026-07-29 (Rest von B5): sie
   * folgt der Community, nicht dem Besucher. Fehlend/'' = keine eigene Wahl,
   * dann gilt die Voreinstellung der Instanz (heutiges Verhalten).
   */
  neutral?: string
  /** Anzeigename des Mandanten (tenants.name) — trägt den öffentlichen
   *  Header der Community-Hosts („Morgenlicht" statt App-Brand). Reiner
   *  Text, wird NIE als Attribut/HTML interpoliert. */
  name?: string
}

/**
 * Produkt-Schalter des Mandanten (S1, Davids Entscheidung 4 vom 2026-07-27).
 *
 * Getrennt von TenantBranding, weil hier keine Optik hängt, sondern eine
 * Zugangsregel: die Autorität ist der Server (assertTenantRegistrationOpen an
 * den Auth-Routen), das UI spiegelt sie nur.
 *
 * `openRegistration` ist OPTIONAL und `undefined` heißt „offen" — Silo-Apps,
 * Playground und Bestands-Fixtures bauen den Kontext ohne das Feld, und die
 * dürfen sich nicht plötzlich zumachen. Der reale Resolver setzt es explizit.
 */
export interface TenantPolicy {
  /** false = neue Mitglieder nur auf Einladung (Register-Seite zeigt Hinweis,
   *  Auth-Routen antworten 403). undefined/true = offen wie bisher. */
  openRegistration?: boolean
  /**
   * Lese-Publikum der Community (C18, Davids Entscheidung vom 2026-07-30:
   * WÄHLBAR, Default öffentlich). 'members' = Inhalte nur für Mitglieder
   * (Row-Permissions `read(label:<communityId>)`, noindex, leere sitemap,
   * kein og:image); 'public' = wie bisher öffentlich lesbar.
   *
   * OPTIONAL, und `undefined` heißt 'public' — dieselbe Bauart wie
   * `openRegistration`: Silo-Apps, Kontroll-Hosts, Playground und
   * Bestands-Fixtures bauen den Kontext ohne das Feld, und die haben gar keine
   * Community-Grenze. Sie stillschweigend zuzumachen wäre der Schaden (die
   * comments-Silo-App wäre über Nacht noindex).
   *
   * ACHTUNG, ZWEI VERSCHIEDENE FRAGEN: das FAIL-CLOSED-Lesen der DB-Spalte
   * (`resolveTenantAudience`, control) passiert im Resolver — der setzt das
   * Feld für jeden echten Mandanten IMMER explizit. Hier geht es nur um
   * „es gibt gar keinen Mandanten".
   */
  audience?: CommunityAudience
  /**
   * Sperre der Community (M13, control-034 — s. shared/communitySuspension.ts).
   *
   * PRAKTISCH KANN HIER NUR `''` ODER `'billing'` STEHEN: eine abuse-Sperre
   * lässt `mapTenantRowToContext()` gar keinen Kontext bauen (der Resolver
   * liefert `null`, der Host 404et wie ein unbekannter). Der Typ trägt trotzdem
   * alle drei Werte, weil es derselbe Spaltenwert ist — ihn hier zu verengen
   * hieße, an zwei Stellen zwei verschiedene Wahrheiten zu pflegen.
   *
   * OPTIONAL, und `undefined` heißt „nicht gesperrt" — dieselbe Bauart wie
   * `openRegistration`/`audience`: Silo-Apps, Kontroll-Hosts, Playground und
   * Bestands-Fixtures bauen den Kontext ohne das Feld, und die haben keinen
   * Vertrag, den man sperren könnte.
   */
  suspension?: CommunitySuspension
}

/**
 * Das Lese-Publikum einer Community (C18). Bewusst hier in core und nicht nur
 * im control-Layer: core zieht daraus die Row-Permissions und die SEO-Regel,
 * und ein Fundament-Layer darf nicht von einem Feature-Layer abhängen (A14).
 * `resolveTenantAudience()` (control) ist der fail-closed LESER der Spalte und
 * liefert genau diese zwei Werte.
 */
export type CommunityAudience = 'members' | 'public'

export type TenantContext =
  /** Eigenes Appwrite-Projekt (Isolation am Projekt) — Spezial-/Enterprise-Kunde. */
  | ({ mode: 'silo', projectId: string, communityId?: string } & TenantBranding & TenantPolicy)
  /**
   * Geteiltes Projekt, Zeilen-Scope über tenantId — Standard-SaaS-Kunde.
   * `plan` (free/pro/business, Default free) staffelt die Quota — core bleibt
   * plan-name-agnostisch (nur ein String-Key in den quota.plans-Katalog).
   * `limits` (optional): vom Resolver bereits AUFGELÖSTE Quota-Limits je
   * kind (z. B. aus dem editierbaren tenant_plans-Katalog des Control Plane)
   * — hat Vorrang vor dem statischen app.config-Katalog (Fallback-Kette in
   * assertPoolWriteQuota).
   */
  /**
   * `trialEndsAt` (M13): Ende der Testphase als ISO-String, wie es in der
   * `communities`-Row steht — `null`/fehlend = keine Testphase (gekauft oder
   * vom Betreiber angelegt). NUR im Pool: eine Silo-Community ist ein
   * Enterprise-Vertrag, die hat keine.
   *
   * BEWUSST NICHT im SSR-Payload gespiegelt (tenant-brand.ts, „Spiegel-
   * Inventar"): der Wert reiste sonst auf JEDER öffentlichen Seite mit und
   * verriete jedem Gast, dass diese Community gerade testet oder ausgelaufen
   * ist. Er wird stattdessen von der Route `/api/community/billing/trial`
   * herausgegeben — capability-gegated an den EINEN, der etwas tun kann.
   */
  | ({ mode: 'pool', projectId: string, tenantId: string, plan?: string, limits?: Record<string, { perDay?: number, total?: number }>, communityId?: string, trialEndsAt?: string | null } & TenantBranding & TenantPolicy)
