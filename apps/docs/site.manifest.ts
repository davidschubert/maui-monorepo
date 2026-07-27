import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Feature-Wahl der öffentlichen Hilfe-Site (docs.pukalani.app).
 *
 * KEINE Feature-Layer: die Seite ist öffentlich, statisch und schreibt nichts —
 * ihre Inhalte liegen als Markdown in `content/` und werden von @nuxt/content
 * gerendert. core + system sind implizit immer dabei (Fundament), deshalb
 * bleibt `features` leer.
 *
 * Warum überhaupt ein Manifest (und damit core + system), wo die interne
 * Entwickler-Doku unter `docs/` bewusst OHNE Layer auskommt: `check-manifests`
 * scannt ausnahmslos jeden Ordner unter `apps/` und verlangt dort ein
 * Site-Manifest samt passendem `extends` (= Features + core + system). Eine
 * „reine Content-App" unter apps/ ist damit nicht vorgesehen — entweder
 * außerhalb von apps/ (wie `docs/`, Port 4000) oder als reguläre App wie hier.
 * Die Entscheidung fiel auf „reguläre App", weil docs.pukalani.app ein
 * öffentlicher Prod-Host ist und dieselbe Behandlung wie die anderen Sites
 * bekommen soll (Fehlerseite, Security-Header, i18n-Fundament, /api/health).
 */
export default {
  siteId: 'docs',
  features: [],
} satisfies SiteManifest
