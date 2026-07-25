/**
 * Ziel-Links der Marketing-CTAs. Das Produkt (Kundenbereich) lebt auf
 * app.pukalani.app (G0-Entscheidung), die Live-Demo auf demo.pukalani.app.
 * Lokal per NUXT_PUBLIC_* überschreibbar; sonst die Prod-Hosts.
 */
export function useProductLinks() {
  const config = useRuntimeConfig()
  const pub = config.public as Record<string, unknown>
  const start = (pub.marketingStartUrl as string) || 'https://app.pukalani.app/register'
  const signIn = (pub.marketingSignInUrl as string) || 'https://app.pukalani.app/login'
  const demo = (pub.marketingDemoUrl as string) || 'https://demo.pukalani.app'
  return { start, signIn, demo }
}
