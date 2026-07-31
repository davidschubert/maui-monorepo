/**
 * Chrome-Registry (Header/Footer der öffentlichen Community-Seiten):
 * Feature-Layer registrieren ihre Nav-Einträge und Header-Utilities in
 * app.config (`pukalani.chrome.nav` / `pukalani.chrome.utilities`), das
 * blueprint-default-Layout rendert daraus — genau wie die Dashboard-Nav
 * über `pukalani.admin.modules` (A14: expliziter Vertrag statt Hardcode).
 *
 * Form: OBJEKT-MAP statt Array (bewusst, Audit S9). Beides merged defu
 * additiv über Layer, aber nur die Map erlaubt zusätzlich, dass eine App
 * einen einzelnen Eintrag ÜBERSCHREIBT oder mit `false` ABSCHALTET
 * (z. B. platform: `whatsNew: false`) — ein Array ließe sich nur noch
 * verlängern. Der Key ist die stabile ID (Dedup inklusive).
 *
 * Liegt in core (Fundament), damit alle Layer den Vertrag nutzen können,
 * ohne sich gegenseitig zu importieren.
 */

/** Eintrag der Haupt-Navigation (Inline-Reihe mit Überlauf-Dropdown). */
export interface PukalaniChromeNavEntry {
  /** i18n-Key des Labels (der Text gehört dem registrierenden Layer) */
  labelKey: string
  /** Ziel-Pfad OHNE Locale-Prefix — das Layout wendet localePath() an */
  to: string
  /** Icon (i-ph-…) — nur im Überlauf-Dropdown sichtbar */
  icon?: string
  /** Sortierung (aufsteigend, Default 50) */
  order?: number
  /** Laufzeit-Feature-Gate (F2): Eintrag verschwindet, wenn das Feature aus ist */
  featureKey?: string
  /**
   * Produkt-Gate im Pool (P4): sichtbar nur, wenn der Tenant-Plan das
   * Produkt enthält (useTenantPlan().planAllows); auf Demo-Hosts hängt
   * das Layout zusätzlich das Plan-Badge („Ab Personal") an.
   */
  planProduct?: string
  /** Nur für eingeloggte Besucher sichtbar */
  requiresAuth?: boolean
}

/** Header-Utility rechts (Buttons/Menüs — DisplaySettingsMenu, Bell, …). */
export interface PukalaniChromeUtility {
  /**
   * Komponenten-Name. Die Komponente MUSS global registriert sein
   * (Datei-Suffix `.global.vue` im besitzenden Layer), sonst kann
   * `<component :is>` den String zur Laufzeit nicht auflösen.
   */
  component: string
  /** Sortierung (aufsteigend, Default 50) */
  order?: number
  /** Laufzeit-Feature-Gate (F2) */
  featureKey?: string
  /** Nur für eingeloggte Besucher rendern */
  requiresAuth?: boolean
  /**
   * Platzierung: 'menu' (Default) = Utility-Reihe rechts im Header;
   * 'overlay' = außerhalb des Headers (schwebende Widgets wie der
   * FeedbackButton — fixed-positioniert, gehört semantisch nicht in die Nav).
   */
  zone?: 'menu' | 'overlay'
}

/** `false` = Eintrag von einer App/einem späteren Layer bewusst abgeschaltet. */
export type PukalaniChromeNavConfig = Record<string, PukalaniChromeNavEntry | false>
export type PukalaniChromeUtilityConfig = Record<string, PukalaniChromeUtility | false>
