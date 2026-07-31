import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Produkt-Wahl der öffentlichen Hilfe-Site.
 *
 * Ziel-Host: **help.pukalani.app** — ANNAHME, von David noch zu bestätigen.
 * Der Ordner heißt `help` (nicht `docs`), weil `docs/` am Repo-Rand schon die
 * INTERNE Entwickler-Doku ist (Port 4000, kein Layer, keine App). Zwei „docs"
 * im selben Baum haben in der Merge-Review sofort verwirrt.
 *
 * Stand: die Site läuft heute NUR im Dev (Port 3008). Die Deploy-Kette
 * (ecosystem-Eintrag, deploy.yml-Slot, ploi-Site, DNS über das Wildcard
 * `*.pukalani.app`) fehlt BEWUSST noch und kommt als eigener Schritt —
 * siehe docs/content/2.architektur/6.hosts-und-ports.md.
 *
 * KEINE Produkt-Layer: die Seite ist öffentlich, statisch und schreibt nichts —
 * ihre Inhalte liegen als Markdown in `content/` und werden von @nuxt/content
 * gerendert. core + system sind implizit immer dabei (Fundament), deshalb
 * bleibt `products` leer.
 *
 * Warum überhaupt ein Manifest (und damit core + system), wo die interne
 * Entwickler-Doku unter `docs/` bewusst OHNE Layer auskommt: `check-manifests`
 * scannt ausnahmslos jeden Ordner unter `apps/` und verlangt dort ein
 * Site-Manifest samt passendem `extends` (= Produkte + core + system). Eine
 * „reine Content-App" unter apps/ ist damit nicht vorgesehen — entweder
 * außerhalb von apps/ (wie `docs/`, Port 4000) oder als reguläre App wie hier.
 * Die Entscheidung fiel auf „reguläre App", weil die Hilfe ein öffentlicher
 * Prod-Host werden soll und dieselbe Behandlung wie die anderen Sites bekommt
 * (Fehlerseite, Security-Header, i18n-Fundament, /api/health).
 */
export default {
  siteId: 'help',
  products: [],
} satisfies SiteManifest
