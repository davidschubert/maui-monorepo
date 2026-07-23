import { resolveEmbedOrigins } from '../../shared/embedOrigins'
import { listEmbedSites } from '../utils/embedSites'

/**
 * Registriert /embed bei der core Frame-Ancestors-Registry (expliziter
 * Vertrag, Embed-Plan E0-3): Ist das Gate maui.comments.embed aktiv, dürfen
 * die statisch konfigurierten Origins PLUS die aktiven Sites der Registry
 * (embed_sites, E3) die Seite framen — alle anderen Routen behalten den
 * 'self'-Default (Clickjacking-Schutz). '*' in allowedOrigins bleibt die
 * bewusste „offen wie Disqus"-Betreiber-Option (Plan § 6.7).
 */
export default defineNitroPlugin(() => {
  registerEmbeddableRoute({
    prefix: '/embed',
    origins: async (event) => {
      const appConfig = useAppConfig(event) as {
        maui?: { comments?: { embed?: { enabled?: boolean, allowedOrigins?: string[] } } }
      }
      const embed = appConfig.maui?.comments?.embed
      if (!embed?.enabled) return []
      const staticOrigins = embed.allowedOrigins ?? []
      if (staticOrigins.includes('*')) return ['*']
      // Registry-Lese-Fehler → nur statische Liste (fail-safe: nie 500 im
      // Header-Pfad, aber auch nie stillschweigend '*')
      const sites = await listEmbedSites(event).catch(() => [])
      return resolveEmbedOrigins(staticOrigins, sites)
    },
  })
})
