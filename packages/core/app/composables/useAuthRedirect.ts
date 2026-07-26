import { safeRedirectTarget } from '../../shared/redirectTarget'

/**
 * Wohin nach erfolgreicher Anmeldung/Registrierung?
 *
 * EINE Stelle für alle Auth-Formulare (Passwort, Registrierung, Code) — sonst
 * hätten wir drei Orte, an denen man das `?redirect=` vergessen kann. Die
 * Prüfung des Ziels liegt in `safeRedirectTarget` (Open-Redirect-Schutz,
 * unit-getestet).
 */
export function useAuthRedirect() {
  const route = useRoute()
  const localePath = useLocalePath()

  /** Das validierte Ziel oder die Startseite. */
  function afterAuthTarget(): string {
    return safeRedirectTarget(route.query.redirect) ?? localePath('/')
  }

  return { afterAuthTarget }
}
