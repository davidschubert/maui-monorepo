/**
 * Produkt-/Site-Manifeste (Plattform-Strategie F1) — Single Source of Truth,
 * WELCHE Produkt-Layer existieren und WELCHE eine Site nutzt. Layer
 * deklarieren `packages/<key>/product.manifest.ts`, Apps
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

export interface ProductManifest {
  /** Produkt-Key — MUSS dem Ordnernamen unter packages/ entsprechen. */
  key: string
  /**
   * foundation = Grundgerüst (bei Platform-Sites immer aktiv);
   * optional = zubuchbares Produkt. Baupflicht in Apps haben nur core+system.
   */
  tier: 'foundation' | 'optional'
  /** Harte Layer-Abhängigkeiten (Build bricht ohne sie) — Produkt-Keys. */
  requires?: string[]
  /** Hat der Layer eigene Appwrite-Migrationen (scripts/migrations/)? */
  hasMigrations: boolean
  /** Abrechnungs-Schlüssel fürs Control Plane (Default = key). */
  entitlementKey?: string
  /** Katalog-Texte (F7) — bewusst im Manifest, nicht in Layer-Locales:
   *  das Control Plane liest Manifeste später ohne Nuxt-/i18n-Kontext. */
  title: ManifestText
  description: ManifestText
  /** Icon für den Produkt-Katalog, z. B. 'i-ph-chat-circle'. */
  icon?: string
  /**
   * API-Pfad-Präfixe des Produkts (z. B. ['/api/comments']) — Grundlage
   * fürs zentrale Laufzeit-Enforcement (core product-gate-Middleware):
   * Produkt aus ⇒ 404 für alle Routen darunter. Nur für optional-Tier
   * relevant (foundation ist nicht schaltbar).
   */
  apiPrefixes?: string[]
}

export interface SiteManifest {
  /** Site-Kennung — App-Ordnername unter apps/ (ohne führenden Unterstrich). */
  siteId: string
  /**
   * Gewählte Produkte (Produkt-Keys). core + system sind IMMER dabei und
   * werden nicht gelistet.
   */
  products: string[]
}
