import type { Models } from 'node-appwrite'

/**
 * E3 Site-Registry (Embed-Plan Task 14): registrierte Einbetter-Domains des
 * Widgets. Die Registry speist die frame-ancestors-CSP von /embed (statt der
 * statischen Allowlist; `maui.comments.embed.allowedOrigins` bleibt als
 * Betreiber-Option — '*' = offen wie Disqus, Einträge wie
 * 'http://localhost:*' fürs Dev-/E2E-Umfeld). Verwaltet unter
 * /dashboard/embed (system.manage), Table gehört dem comments-Layer (A14).
 */

export const EMBED_SITES_TABLE = 'embed_sites'

export interface EmbedSiteRow extends Models.Row {
  /** Kanonischer Host des Einbetters (klein, ohne Port) — Unique-Index. */
  host: string
  /** Anzeigename ('' erlaubt). */
  label: string
  /** Erlaubte targetTypes auf dieser Site; leer = alle. */
  targetTypes: string[]
  /** false = Site bewusst abgeschaltet (fliegt aus der CSP-Allowlist). */
  active: boolean
}
