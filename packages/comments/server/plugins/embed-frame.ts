/**
 * Registriert /embed bei der core Frame-Ancestors-Registry (expliziter
 * Vertrag, Embed-Plan E0-3): Ist das Gate maui.comments.embed aktiv, dürfen
 * die konfigurierten Origins (bzw. '*') die Seite framen — alle anderen
 * Routen behalten den 'self'-Default (Clickjacking-Schutz).
 */
export default defineNitroPlugin(() => {
  registerEmbeddableRoute({
    prefix: '/embed',
    origins: (event) => {
      const appConfig = useAppConfig(event) as {
        maui?: { comments?: { embed?: { enabled?: boolean, allowedOrigins?: string[] } } }
      }
      const embed = appConfig.maui?.comments?.embed
      if (!embed?.enabled) return []
      return embed.allowedOrigins ?? []
    },
  })
})
