/**
 * Ziel-Links der Marketing-CTAs. Der Kundenbereich lebt auf my.pukalani.app
 * (Umbenennung 2026-07-25, vorher app.pukalani.app), die Live-Demo auf
 * demo.pukalani.app. Lokal per NUXT_PUBLIC_* überschreibbar; sonst die
 * Prod-Hosts.
 */
export function useProductLinks() {
  const config = useRuntimeConfig()
  const pub = config.public as Record<string, unknown>
  const start = (pub.marketingStartUrl as string) || 'https://my.pukalani.app/register'
  const signIn = (pub.marketingSignInUrl as string) || 'https://my.pukalani.app/login'
  const demo = (pub.marketingDemoUrl as string) || 'https://demo.pukalani.app'
  return { start, signIn, demo }
}
