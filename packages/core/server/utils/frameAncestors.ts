import type { H3Event } from 'h3'

/**
 * Frame-Ancestors-Registry (Embed-Vorarbeit E0): Standardmäßig bekommt JEDE
 * SSR-Seite `Content-Security-Policy: frame-ancestors 'self'` (Clickjacking-
 * Schutz für Login/Dashboard). Feature-Layer mit framebaren Routen (z. B.
 * comments `/embed`) registrieren ihre Pfade hier per Nitro-Plugin — expliziter
 * Vertrag wie registerUserDataContributor, keine core→Feature-Kopplung.
 * `X-Frame-Options` bleibt bewusst weg (CSP reicht; XFO kann frame-ancestors
 * nicht abbilden).
 */

export interface EmbeddableRoute {
  /** Pfad-Präfix OHNE Locale-Präfix (z. B. '/embed' matcht auch '/de/embed') */
  prefix: string
  /**
   * Erlaubte Einbetter-Origins zum Request-Zeitpunkt. Rückgabe:
   * `['*']` = jede Seite darf framen · Liste = Allowlist (zusätzlich zu
   * 'self') · leer = nur 'self' (z. B. Gate deaktiviert).
   * Darf async sein (E3: Registry-gespeiste Allowlist aus einer Table —
   * der Aufrufer cached selbst, z. B. per Microcache).
   */
  origins: (event: H3Event) => string[] | Promise<string[]>
}

const routes: EmbeddableRoute[] = []

export function registerEmbeddableRoute(route: EmbeddableRoute) {
  routes.push(route)
}

/** Locale-Präfix (de, en-US, …) abstreifen — i18n prefix_except_default. */
function stripLocale(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/)/, '')
}

/** Wert für `frame-ancestors` zum Pfad — Default `'self'`. */
export async function resolveFrameAncestors(event: H3Event, pathname: string): Promise<string> {
  const path = stripLocale(pathname)
  const match = routes.find(r => path === r.prefix || path.startsWith(`${r.prefix}/`) || path.startsWith(`${r.prefix}?`))
  if (!match) return `'self'`
  const origins = await match.origins(event)
  if (origins.includes('*')) return '*'
  // Nur http(s)-Origins zulassen — die Liste landet unescaped im CSP-Header.
  // ':*' als Port-Wildcard ist gültige CSP-host-source (Dev/E2E: localhost:*).
  const safe = origins.filter(o => /^https?:\/\/[\w.[\]-]+(:(\d+|\*))?$/.test(o))
  return safe.length ? `'self' ${safe.join(' ')}` : `'self'`
}
