import { resolveFrameAncestors } from '../utils/frameAncestors'

/**
 * Setzt `Content-Security-Policy: frame-ancestors …` auf jede SSR-gerenderte
 * Seite (Embed-Vorarbeit E0): Default 'self' (Clickjacking-Schutz für Login/
 * Dashboard), registrierte Embed-Routen (frameAncestors.ts) bekommen ihre
 * Allowlist bzw. '*'. API-Antworten brauchen keinen frame-ancestors (nur
 * Dokumente werden geframet) — render:response greift genau richtig.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, { event }) => {
    const value = resolveFrameAncestors(event, getRequestURL(event).pathname)
    response.headers = {
      ...response.headers,
      'content-security-policy': `frame-ancestors ${value}`,
    }
  })
})
