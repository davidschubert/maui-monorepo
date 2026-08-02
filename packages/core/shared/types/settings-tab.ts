import type { Capability } from './authz'
import type { DashboardPlace, DashboardScope } from '../dashboardNav'
import { isDashboardScope, moduleAllowedFor, scopeVisibleAt } from '../dashboardNav'

/**
 * Reiter der Einstellungs-Hülle (`/dashboard/settings`), den ein Layer
 * registriert (app.config: `pukalani.admin.settingsTabs`, deep-merged/
 * konkateniert über alle Layer).
 *
 * WARUM ES DIESE REGISTRY GIBT (F24, 2026-08-02): die Hülle
 * (packages/admin/app/pages/dashboard/settings.vue) trug den Community-Reiter
 * fest verdrahtet, obwohl die Seite dahinter ausschließlich Routen des
 * onboarding-Layers ruft. Eine Silo-App ohne onboarding bekam damit einen
 * Reiter, dessen Seite ins Leere greift — sie war nur zur LAUFZEIT versteckt
 * (`isTenantHost`), also durch eine Beobachtung statt durch den Bauplan. Jetzt
 * gilt dieselbe Regel wie bei `pukalani.admin.modules`: wer die Routen besitzt,
 * registriert den Einstieg. Ohne den Layer gibt es den Reiter gar nicht.
 *
 * Die vier KONTO-Reiter (Allgemein, Benachrichtigungen, Geräte, Sicherheit)
 * bleiben bewusst in der Hülle verdrahtet: sie gehören dem admin-Layer selbst,
 * der die Hülle mitbringt — eine Registry, in die sich ein Layer bei sich
 * selbst einträgt, wäre Umweg ohne Gewinn.
 *
 * Liegt in core (Fundament), damit admin (Konsument) und die Produkt-Layer
 * (Registrierende) denselben Vertrag nutzen, ohne sich gegenseitig zu
 * importieren (Layer-Grenze A14) — genauso wie admin-module.ts.
 */
export interface PukalaniSettingsTab {
  /** Stabile ID (key/Dedup) */
  id: string
  /**
   * EBENE des Reiters — dieselbe Bedeutung und dieselbe pure Regel wie bei
   * `PukalaniAdminModule.scope` (core/shared/dashboardNav.ts): 'community'
   * verschwindet auf einem Kontroll-Host, 'operator' auf einem Mandanten-Host,
   * 'account' gilt überall. PFLICHT, damit kein geratener Default einen Reiter
   * unsichtbar an den falschen Ort legt.
   */
  scope: DashboardScope
  /** i18n-Key des Reiter-Labels */
  labelKey: string
  /** Icon (i-ph-…) */
  icon: string
  /** Ziel-Pfad OHNE Locale-Prefix — die Hülle wendet localePath() an */
  to: string
  /** Erforderliche Capability (RBAC-gefiltert, wie bei den Modulen) */
  requiredCapability: Capability
  /** Sortierung (aufsteigend); ohne Angabe hinter den Konto-Reitern */
  order?: number
}

/**
 * Die sichtbaren Reiter, sortiert. PURE, damit Hülle und Test dieselbe Wahrheit
 * lesen — und damit die Regel nicht ein zweites Mal in einer .vue entsteht.
 *
 * Es ist bewusst DIESELBE Regel wie bei den Sidebar-Modulen (Ort × Capability,
 * core/shared/dashboardNav.ts), nur ohne `placement`/Produkt-Gates: ein Reiter
 * und ein Menüpunkt beantworten dieselbe Frage, und zwei Regelwerke für eine
 * Frage laufen auseinander. Die beiden Rechte-Quellen bleiben getrennt
 * (`moduleAllowedFor`): Betreiber-Reiter nur per Label, Community-Reiter per
 * Rolle ODER Label (Support-Break-Glass).
 *
 * Ein unbekanntes `scope` fällt heraus (fail-closed) — genau wie in
 * `filterDashboardModules`.
 *
 * NUR UX. Die Autorität bleibt `requiredCapability` in der Page-Meta und
 * `requireCommunityPermission` auf den Routen.
 */
export function resolveSettingsTabs(
  tabs: readonly PukalaniSettingsTab[] | undefined,
  filter: {
    place: DashboardPlace
    canAsOperator: (capability: Capability) => boolean
    canAsMember: (capability: Capability) => boolean
  },
): PukalaniSettingsTab[] {
  return (tabs ?? [])
    .filter(tab =>
      isDashboardScope(tab.scope)
      && scopeVisibleAt(tab.scope, filter.place)
      && moduleAllowedFor(tab, filter))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}
