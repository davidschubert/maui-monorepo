/**
 * Setzt auf jeder Page ein <link rel="canonical"> auf die kanonische, Slash-lose
 * URL — Gegenstück zur trailing-slash-Middleware. Nutzt die konfigurierte
 * Produktions-URL (NUXT_PUBLIC_APP_URL); im Dev fällt es auf den Request-Origin
 * zurück. Query-Parameter bleiben außen vor (Canonical zeigt auf den reinen Pfad).
 */
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const config = useRuntimeConfig()
  const requestUrl = useRequestURL()

  useHead(() => {
    const origin = (config.public.appUrl as string) || requestUrl.origin
    const path = route.path.length > 1 ? route.path.replace(/\/+$/, '') : route.path
    return { link: [{ rel: 'canonical', href: origin + path }] }
  })
})
