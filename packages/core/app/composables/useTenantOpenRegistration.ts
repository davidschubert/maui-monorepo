/**
 * Mitglieder-Registrierung dieser Community offen? (S1, Davids Entscheidung 4
 * vom 2026-07-27) — SSR-gespiegelt via tenant-brand-Plugin, reist im Payload.
 *
 * Drei Zustände, und der dritte ist der wichtige:
 *   true  = Tenant-Host mit offener Registrierung (Formular wie bisher)
 *   false = Tenant-Host, „nur auf Einladung" (Hinweis statt Formular)
 *   null  = KEIN Tenant-Host (Silo-App, Kontroll-Host, Playground) — dort gibt
 *           es keine Community-Grenze, die Registrierung regelt weiterhin
 *           allein app_config.registrationEnabled (useRuntimeFlags).
 *
 * Die AUTORITÄT ist serverseitig (assertTenantRegistrationOpen an
 * /api/auth/signup + /api/auth/otp) — hier geht es nur um die Ansage.
 */
export function useTenantOpenRegistration() {
  const state = useState<boolean | null>('maui-tenant-open-registration', () => null)
  /** Explizit geschlossen — nur `false` zählt, `null` ist kein Tenant. */
  const closed = computed(() => state.value === false)
  return { openRegistration: state, closed }
}
