import type { Capability } from './authz'
import type { DashboardScope } from '../dashboardNav'

/**
 * Admin-Modul, das ein Produkt-Layer im Dashboard registriert
 * (app.config: `pukalani.admin.modules`, deep-merged über alle Layer). Das
 * Admin-Layout baut die Navigation daraus — so muss `admin` die Produkt-
 * Sektionen NICHT hart kennen; ein neues Produkt steckt sich nur „ein".
 *
 * Liegt in core (Fundament), damit Produkt-Layer (comments, …) UND admin den
 * Vertrag nutzen, ohne sich gegenseitig zu importieren (Layer-Grenze A14).
 */
export interface PukalaniAdminModuleChild {
  /** Stabile ID (key/Dedup) */
  id: string
  /** i18n-Key des Nav-Labels */
  labelKey: string
  /** Icon (i-ph-…), optional bei Unterpunkten */
  icon?: string
  /** Ziel-Pfad OHNE Locale-Prefix — das Layout wendet localePath() an */
  to: string
  /** Erforderliche Capability — ohne Angabe gilt die des Eltern-Moduls */
  requiredCapability?: Capability
  /** true = nur bei exakter Pfad-Übereinstimmung aktiv (für Index-Unterpunkte) */
  exact?: boolean
}

export interface PukalaniAdminModule {
  /** Stabile ID (key/Dedup) */
  id: string
  /**
   * EBENE des Eintrags (E9, Davids Navigation vom 2026-07-30 —
   * docs/plans/DASHBOARD-IA.md). PFLICHT, und zwar aus demselben Grund wie
   * `scope` bei `notify()`: ein geratener Default legt einen Eintrag an den
   * falschen Ort, und zwar unsichtbar. Der Typfehler erzwingt die Entscheidung
   * an JEDER Registrierung.
   *
   *  - 'operator'  — Betreiber-Sache (Plattform, Studio, Instanz-Infrastruktur).
   *    Verschwindet auf Mandanten-Hosts: dort wäre es die Verwaltung einer
   *    fremden Plattform.
   *  - 'community' — Verwaltung EINER Kunden-Community durch ihr Team.
   *    Erscheint nur auf dem Host dieser Community — mit der Ausnahme des
   *    Silo-/Einzelbetriebs, wo es gar keine Mandanten gibt und dieselbe Seite
   *    seit jeher dem Betreiber gehört (dieselbe Semantik wie
   *    `decideCommunityAccess`, s. shared/dashboardNav.ts).
   *  - 'account'   — Konto-Sache. Überall, für jeden Angemeldeten.
   *
   * Die Ebene sagt WO der Eintrag steht; `requiredCapability` sagt WER ihn
   * sieht. Beide filtern, keiner ersetzt den anderen.
   */
  scope: DashboardScope
  /**
   * Produkt-Key des besitzenden Layers (F2): ist das Produkt per Laufzeit-
   * Gate deaktiviert, blendet die Dashboard-Nav den Eintrag aus (live über
   * den Realtime-Config-Kanal). Ohne Angabe immer sichtbar — die AUTORITÄT
   * bleibt die Server-Middleware (Routen 404en), die Nav ist nur UX.
   */
  productKey?: string
  /** i18n-Key des Nav-Labels */
  labelKey: string
  /** Icon (i-ph-…) */
  icon: string
  /** Ziel-Pfad OHNE Locale-Prefix — das Layout wendet localePath() an */
  to: string
  /** Erforderliche Capability (RBAC-gefiltert) */
  requiredCapability: Capability
  /**
   * Unterpunkte: macht den Eintrag zum aufklappbaren Abschnitt (die
   * Modul-Seite selbst dann als ersten Unterpunkt mit aufnehmen).
   */
  children?: PukalaniAdminModuleChild[]
  /**
   * Nav-Gruppe: Module mit gleicher Gruppe rendert das Layout unter einem
   * gemeinsamen Abschnitts-Label (i18n-Key admin.nav.groups.<group>);
   * Gruppen-Reihenfolge definiert das Layout. Ohne Gruppe = oben.
   *
   * Die Gruppen sind Davids Struktur (E9, docs/plans/DASHBOARD-IA.md) und
   * hängen an der Ebene — eine Gruppe mischt keine Ebenen:
   *  - Betreiber: 'platform' (Communities, Anfragen, Codes, gesperrte Namen)
   *    · 'studio' (Websites) · 'management' (Betreiber-Werkzeuge: Feedback,
   *    Board)
   *  - Community: 'website' (Seiten) · 'products' (Beiträge, Events, Kurse,
   *    Medien) · 'branding' (Themes, Schriften) · 'settings' (Abo, Moderation,
   *    Embed, Protokoll, Mitglieder)
   *
   * 'design' ist mit E9 entfallen: Themes zogen nach 'branding', Medien zu den
   * Produkten — eine Gruppe mit einem einzigen Eintrag ist kein Abschnitt.
   */
  group?: 'platform' | 'studio' | 'management' | 'website' | 'products' | 'branding' | 'settings'
  /** Sortierung INNERHALB der Gruppe (aufsteigend; ohne = Registry-Reihenfolge) */
  order?: number
  /**
   * Platzierung: 'nav' (Default) = Sidebar-Hauptnavigation;
   * 'bottom' = unten in der Sidebar, beim Betreiber-Unterbau (Nutzer, Admin,
   * Speicher, System) — für selten gebrauchte Instanz-Einträge;
   * 'userMenu' = im Account-Menü unten (über den Einstellungen) —
   * für Konto-nahe Bereiche wie Abos.
   */
  placement?: 'nav' | 'bottom' | 'userMenu'
}
