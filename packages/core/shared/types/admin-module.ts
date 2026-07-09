import type { Capability } from './authz'

/**
 * Admin-Modul, das ein Feature-Layer im Dashboard registriert
 * (app.config: `maui.admin.modules`, deep-merged über alle Layer). Das
 * Admin-Layout baut die Navigation daraus — so muss `admin` die Feature-
 * Sektionen NICHT hart kennen; ein neues Feature steckt sich nur „ein".
 *
 * Liegt in core (Fundament), damit Feature-Layer (comments, …) UND admin den
 * Vertrag nutzen, ohne sich gegenseitig zu importieren (Layer-Grenze A14).
 */
export interface MauiAdminModuleChild {
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

export interface MauiAdminModule {
  /** Stabile ID (key/Dedup) */
  id: string
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
  children?: MauiAdminModuleChild[]
  /**
   * Nav-Gruppe: Module mit gleicher Gruppe rendert das Layout unter einem
   * gemeinsamen Abschnitts-Label (i18n-Key admin.nav.groups.<group>);
   * Gruppen-Reihenfolge definiert das Layout. Ohne Gruppe = oben.
   */
  group?: 'products' | 'management' | 'design'
  /** Sortierung INNERHALB der Gruppe (aufsteigend; ohne = Registry-Reihenfolge) */
  order?: number
  /**
   * Platzierung: 'nav' (Default) = Sidebar-Hauptnavigation;
   * 'userMenu' = im Account-Menü unten (über den Einstellungen) —
   * für Konto-nahe Bereiche wie Abos.
   */
  placement?: 'nav' | 'userMenu'
}
