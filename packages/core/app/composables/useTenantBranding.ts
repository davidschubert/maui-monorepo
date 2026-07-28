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
 * useTheme() (Cookie schlägt Community-Wahl schlägt Instanz-Default). Hier
 * geht es um das, was die Community EINGESTELLT hat — sonst zeigt das
 * Dashboard dem Owner seine eigene Cookie-Wahl als Community-Farbe.
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
