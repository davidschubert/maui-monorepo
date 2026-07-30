/**
 * Erscheinungsbild DIESER Community — die am Mandanten GESETZTE Wahl
 * (Davids Entscheidung 12 vom 2026-07-28), SSR-gespiegelt via
 * tenant-brand-Plugin, reist im Payload.
 *
 * Drei Zustände, und der dritte ist der wichtige:
 *   { theme: 'crimson', variant: 'deep' } = die Community hat gewählt
 *   { theme: '', variant: '' }            = Tenant-Host OHNE eigene Wahl —
 *                                           die Instanz-Einstellung
 *                                           (app_config.themeSettings) gilt
 *   null                                  = KEIN Tenant-Host (Silo-App,
 *                                           Kontroll-Host, Playground); dort
 *                                           gehört die Optik der Instanz
 *
 * Bewusst NICHT der aufgelöste Zustand: was der Besucher gerade SIEHT, sagt
 * useTheme() — hier geht es um das, was die Community EINGESTELLT hat, sonst
 * zeigte das Dashboard dem Owner eine andere Farbe als die eigene Wahl.
 * Seit dem 2026-07-29 (Davids Entscheidung B5) ist dieser State auch die
 * QUELLE der Auflösung: auf einem Mandanten-Host gewinnt die Community, das
 * Theme-Cookie des Besuchers wird dort nicht gelesen (Regel:
 * packages/themes/shared/themeSelection.ts). Vorher gewann immer das Cookie —
 * damit sah jeder Besucher mit eigener Theme-Wahl JEDE Community in seinen
 * Farben.
 *
 * Die AUTORITÄT ist das Control Plane (tenants.theme/variant); geschrieben
 * wird über PATCH /api/site/branding (onboarding-Layer → Control Plane).
 * Nach dem Schreiben ist dieser Wert bis zum Ablauf des Resolver-Caches
 * (≤30 s) veraltet — die Seite übernimmt deshalb den Wert aus der ANTWORT.
 */
export interface TenantBrandingSelection {
  /** Built-in-Theme-Id oder '' = Instanz-Einstellung. */
  theme: string
  /** Tonale Variante oder '' = Basisfarbe. */
  variant: string
}

export function useTenantBranding() {
  const branding = useState<TenantBrandingSelection | null>('maui-tenant-branding', () => null)
  /** true = dieser Host gehört einer Community (nur dann ist die Wahl sinnvoll). */
  const isTenantHost = computed(() => branding.value !== null)
  return { branding, isTenantHost }
}
