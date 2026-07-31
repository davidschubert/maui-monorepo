import type { Capability } from './authz'

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
