import type { Capability } from './types/authz'

/**
 * DIE EINE NAVIGATIONS-REGEL des Dashboards (E9, Davids Entscheidung
 * 2026-07-30, docs/plans/DASHBOARD-IA.md) — PURE, damit Layout und Test
 * dieselbe Wahrheit lesen.
 *
 * Es gibt EINE Dashboard-Navigation. Welche Einträge erscheinen, entscheidet
 * sich nach ORT und ROLLE, nicht nach App:
 *
 *  - **Betreiber** (`operator`): Plattform-Verwaltung. Nur dort, wo es keine
 *    fremde Community gibt — auf einem Mandanten-Host hat das nichts zu suchen.
 *  - **Community** (`community`): Verwaltung EINER Kunden-Community durch ihr
 *    Team. Nur auf dem Host dieser Community.
 *  - **Konto** (`account`): überall, für jeden Angemeldeten.
 *
 * DIE DOPPEL-NATUR (und warum sie kein Sonderfall ist): dieselbe Seite ist im
 * Silo-/Einzelbetrieb eine BETREIBER-Seite (apps/comments moderiert seine
 * eigenen Kommentare) und im Pool eine COMMUNITY-Seite. Genau diese Semantik
 * hat `decideCommunityAccess` schon serverseitig — ohne Mandanten-Kontext
 * entscheidet das Operator-Label, mit Mandanten-Kontext die Community-Rolle.
 * `scopeVisibleAt` spiegelt das: im Einzelbetrieb ist JEDER Scope sichtbar,
 * die Capability filtert wie bisher. Nur wo es überhaupt Mandanten GIBT,
 * trennt der Ort die Ebenen.
 *
 * NUR UX: die Autorität bleiben `requirePermission` /
 * `requireCommunityPermission` auf den Routen und `requiredCapability` in der
 * Page-Meta. Diese Regel entscheidet, was im Menü STEHT — nie, was geht.
 */

/** Ebene, auf der ein Dashboard-Modul lebt. Pflichtfeld an jeder Registrierung. */
export type DashboardScope = 'operator' | 'community' | 'account'

export const DASHBOARD_SCOPES: readonly DashboardScope[] = ['operator', 'community', 'account']

/**
 * Type-Guard — und zugleich das Netz unter dem Pflichtfeld: `app.config.ts`
 * wird NICHT gegen `PukalaniAdminModule` typgeprüft (der Typ ist dort nicht
 * auto-importiert, das Layout castet erst beim Lesen). Ein vergessenes `scope`
 * wäre also nur ein Kommentar-Fehler. Hier wird er zu einem Verhalten:
 * unbekannte Ebene ⇒ der Eintrag erscheint NIRGENDS (fail-closed). Ein
 * fehlender Menüpunkt fällt beim ersten Blick auf, ein an den falschen Ort
 * gerutschter nicht.
 */
export function isDashboardScope(value: unknown): value is DashboardScope {
  return typeof value === 'string' && (DASHBOARD_SCOPES as readonly string[]).includes(value)
}

/**
 * Der ORT, an dem die Dashboard-Shell gerade läuft.
 *
 *  - `community`     — Mandanten-Host (Community eines Kunden)
 *  - `control`       — Kontroll-Host einer mandantenfähigen App (Kundenbereich,
 *                      Onboarding): es GIBT Communities, aber diese hier ist
 *                      keine. Community-Einträge wären Einstellungen für eine
 *                      Community, die es an diesem Ort nicht gibt.
 *  - `single-tenant` — App ganz ohne Mandanten (Silo, Betreiber-Konsole,
 *                      Playground). Kein Ort trennt hier etwas; es filtert
 *                      allein die Capability, genau wie vor E9.
 */
export type DashboardPlace = 'community' | 'control' | 'single-tenant'

/**
 * Ort aus den zwei Tatsachen, die Server und Browser gleichermaßen kennen:
 * ist die Mandantenfähigkeit dieser App überhaupt an (`pukalani.tenancy.
 * enabled`), und ist DIESER Host ein Mandant (`isTenantHost`, shared/
 * controlCenter.ts)?
 */
export function resolveDashboardPlace(tenancyEnabled: boolean, tenantHost: boolean): DashboardPlace {
  if (!tenancyEnabled) return 'single-tenant'
  return tenantHost ? 'community' : 'control'
}

/** Darf ein Modul dieser Ebene an diesem Ort überhaupt im Menü stehen? */
export function scopeVisibleAt(scope: DashboardScope, place: DashboardPlace): boolean {
  // Konto gilt überall — Profil und Benachrichtigungen braucht jeder, immer.
  if (scope === 'account') return true
  // Ohne Mandanten gibt es keine zweite Ebene, die man trennen könnte.
  if (place === 'single-tenant') return true
  return place === 'community' ? scope === 'community' : scope === 'operator'
}

/** Was `filterDashboardModules` von einem Modul mindestens braucht. */
export interface DashboardNavModule {
  scope: DashboardScope
  requiredCapability: Capability
  placement?: 'nav' | 'bottom' | 'userMenu'
  productKey?: string
}

export interface DashboardNavFilter {
  place: DashboardPlace
  /** Nur Module DIESER Platzierung (Default in der Registry ist 'nav'). */
  placement: 'nav' | 'bottom' | 'userMenu'
  /** Capabilities aus GLOBALEN Operator-Labels (authz.ts). */
  canAsOperator: (capability: Capability) => boolean
  /** Capabilities aus der COMMUNITY-Rolle dieses Hosts (communityAuthz.ts). */
  canAsMember: (capability: Capability) => boolean
  /** Laufzeit-Produkt-Gate (F2) — ohne Angabe zählt jedes Produkt als an. */
  productOn?: (productKey: string | undefined) => boolean
}

/**
 * Darf dieser Betrachter das Modul sehen? Die zwei Rechte-Quellen sind
 * BEWUSST getrennt und spiegeln `decideCommunityAccess` (shared/
 * communityAccess.ts):
 *
 *  - `operator` — NUR das globale Label. Eine Community-Rolle erreicht ein
 *    Betreiber-Modul nie, an keinem Ort. Ohne diese Trennung genügte eine
 *    schwache Capability am Modul (`dashboard.access` an der internen Doku),
 *    und jedes Community-Mitglied hätte den Eintrag — der Ort allein schützt
 *    ihn nicht, denn im Einzelbetrieb gibt es keinen.
 *  - `community` — Rolle ODER Label: der Betreiber-Break-Glass, mit dem er im
 *    Support-Fall im Kunden-Dashboard arbeitet, ist serverseitig erlaubt und
 *    protokolliert; das Menü darf ihn nicht verschweigen.
 *  - `account` — beides zählt; Konto-Einträge tragen ohnehin nur
 *    `dashboard.access`.
 */
export function moduleAllowedFor(
  module: DashboardNavModule,
  filter: Pick<DashboardNavFilter, 'canAsOperator' | 'canAsMember'>,
): boolean {
  const capability = module.requiredCapability
  if (module.scope === 'operator') return filter.canAsOperator(capability)
  return filter.canAsOperator(capability) || filter.canAsMember(capability)
}

/**
 * Die sichtbaren Module einer Platzierung, in Registry-Reihenfolge.
 * Reihenfolge der Prüfungen ist egal (alle sind UND-verknüpft); die
 * Gruppierung/Sortierung macht das Layout.
 */
export function filterDashboardModules<M extends DashboardNavModule>(
  modules: readonly M[],
  filter: DashboardNavFilter,
): M[] {
  const productOn = filter.productOn ?? (() => true)
  return modules.filter(m =>
    (m.placement ?? 'nav') === filter.placement
    && isDashboardScope(m.scope)
    && scopeVisibleAt(m.scope, filter.place)
    && moduleAllowedFor(m, filter)
    && productOn(m.productKey),
  )
}
