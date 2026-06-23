/**
 * Erscheinungsbild (Color-Mode) über Tabs/Fenster live synchronisieren — genau
 * wie Theme/Neutral. Die spiegeln ihren Cookie via Nuxts experimental.cookieStore
 * automatisch in alle offenen Tabs; useColorMode nutzt aber localStorage und
 * bekommt das nicht mit.
 *
 * Lösung: colorMode.preference an einen eigenen, cookieStore-reaktiven Cookie
 * koppeln (beidseitig). color-mode behält localStorage fürs flash-freie SSR-
 * Skript; der Cookie ist nur der Sync-Kanal. Cookie ist per-Browser — gleiche
 * Reichweite wie Theme/Neutral (Tabs/Fenster, nicht geräteübergreifend).
 */
export default defineNuxtPlugin(() => {
  const colorMode = useColorMode()
  const cookie = useCookie<string>('maui-color-mode', {
    default: () => colorMode.preference,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
  })

  // Lokale Änderung → Cookie schreiben (persistiert + broadcastet via cookieStore)
  watch(() => colorMode.preference, (pref) => {
    if (pref && pref !== cookie.value) cookie.value = pref
  })

  // Externe Änderung (anderer Tab/Fenster) → Color-Mode anwenden
  watch(cookie, (val) => {
    if (val && val !== colorMode.preference) colorMode.preference = val
  })
})
