/**
 * E2 Embed-Login — POPUP-Seite (Embed-Plan § 3a): die Login-Seite läuft mit
 * `?embed=1` als Top-Level-Popup, das ein cross-site eingebettetes iframe
 * unserer eigenen Origin geöffnet hat. Nach erfolgreichem Login holt das
 * Popup ein kurzlebiges Handoff-Token und reicht es per postMessage ans
 * iframe (targetOrigin = STRIKT die eigene Origin — die Hostseite des
 * Einbetters sieht das Token nie); das iframe löst es gegen das
 * CHIPS-partitionierte Session-Cookie ein (POST /api/auth/embed-session).
 *
 * Nutzung in den Auth-Formularen: nach dem Login-Erfolg
 * `if (await completeEmbedLogin()) return` VOR der normalen Navigation.
 */
export function useEmbedPopup() {
  const route = useRoute()
  const isEmbedPopup = computed(() => route.query.embed === '1')

  async function completeEmbedLogin(): Promise<boolean> {
    if (!isEmbedPopup.value || !import.meta.client) return false
    try {
      const { token } = await $fetch<{ token: string }>('/api/auth/embed-handoff', { method: 'POST' })
      window.opener?.postMessage({ type: 'maui:embed-login', token }, window.location.origin)
    }
    catch {
      // Handoff scheiterte (Gate aus / Session weg) — Popup schließt trotzdem,
      // das iframe bleibt im Gast-Modus und zeigt seinen Fallback-Hinweis.
    }
    window.close()
    return true
  }

  return { isEmbedPopup, completeEmbedLogin }
}
