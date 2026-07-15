/**
 * Feature-/Site-Manifeste (Plattform-Strategie F1) — Single Source of Truth,
 * WELCHE Feature-Layer existieren und WELCHE eine Site nutzt. Layer
 * deklarieren `packages/<key>/feature.manifest.ts`, Apps
 * `apps/<app>/site.manifest.ts`; `pnpm check:manifests` hält `extends` und
 * `package.json` dagegen konsistent (CI).
 *
 * WICHTIG: Manifeste werden auch OHNE Nuxt geladen (Node
 * --experimental-strip-types, wie bootstrap.ts) — Manifest-Dateien dürfen
 * aus diesem Modul daher ausschließlich per `import type` importieren.
 */

/** Anzeigetexte in allen Plattform-Sprachen (EN = Default, DE = optional). */
export interface ManifestText {
  en: string
  de: string
}

export interface FeatureManifest {
  /** Feature-Key — MUSS dem Ordnernamen unter packages/ entsprechen. */
  key: string
  /**
   * foundation = Grundgerüst (bei Platform-Sites immer aktiv);
   * optional = zubuchbares Feature. Baupflicht in Apps haben nur core+system.
   */
  tier: 'foundation' | 'optional'
  /** Harte Layer-Abhängigkeiten (Build bricht ohne sie) — Feature-Keys. */
  requires?: string[]
  /** Hat der Layer eigene Appwrite-Migrationen (scripts/migrations/)? */
  hasMigrations: boolean
  /** Abrechnungs-Schlüssel fürs Control Plane (Default = key). */
  entitlementKey?: string
  /** Katalog-Texte (F7) — bewusst im Manifest, nicht in Layer-Locales:
   *  das Control Plane liest Manifeste später ohne Nuxt-/i18n-Kontext. */
  title: ManifestText
  description: ManifestText
  /** Icon für den Feature-Katalog, z. B. 'i-ph-chat-circle'. */
  icon?: string
}

export interface SiteManifest {
  /** Site-Kennung — App-Ordnername unter apps/ (ohne führenden Unterstrich). */
  siteId: string
  /**
   * Gewählte Features (Feature-Keys). core + system sind IMMER dabei und
   * werden nicht gelistet.
   */
  features: string[]
}
