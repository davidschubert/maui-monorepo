/**
 * Erscheinungsbild DIESER Community — die am Mandanten GESETZTE Wahl
 * (Davids Entscheidung 12 vom 2026-07-28), SSR-gespiegelt via
 * tenant-brand-Plugin, reist im Payload.
 *
 * Drei Zustände, und der dritte ist der wichtige:
 *   { theme: 'crimson', … } = die Community hat gewählt
 *   { theme: '', … }        = Tenant-Host OHNE eigene Wahl — die
 *                             Instanz-Einstellung (app_config.themeSettings)
 *                             gilt
 *   null                    = KEIN Tenant-Host (Silo-App, Kontroll-Host,
 *                             Playground); dort gehört die Optik der Instanz
 *
 * DREI FELDER, JEDES MIT DEMSELBEN LEER-ZUSTAND: `theme`, `variant` und — seit
 * dem 2026-07-29 (Davids Entscheidung, Rest von OPEN-ITEMS B5) — `neutral`, die
 * gedeckte Grau-Tönung (`data-neutral`, control-020). Sie ist eine EIGENE
 * Achse: eine Community kann die Palette wählen, ohne ein Theme zu wählen.
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
 * Die AUTORITÄT ist das Control Plane (communities.theme/variant/neutral);
 * geschrieben wird über PATCH /api/community/branding (onboarding-Layer →
 * Control Plane). Nach dem Schreiben ist dieser Wert bis zum Ablauf des
 * Resolver-Caches (≤30 s) veraltet — die Seite übernimmt deshalb den Wert aus
 * der ANTWORT.
 *
 * LIVE SEIT D6 (2026-08-01): dieselbe Route spiegelt den bestätigten Zustand in
 * die read(any)-Tabelle `community_branding` des RUNTIME-Projekts, und
 * `realtime-branding.client.ts` schreibt ein Spiegel-Event direkt in diesen
 * State — offene Fenster (auch die von Gästen) morphen ohne Reload. Wer diesen
 * State liest, muss also damit rechnen, dass er sich zur Laufzeit ändert; wer
 * ihn SETZT, sollte den bestätigten Zustand setzen, nicht den gewünschten.
 */
export interface TenantBrandingSelection {
  /** Built-in-Theme-Id oder '' = Instanz-Einstellung. */
  theme: string
  /** Tonale Variante oder '' = Basisfarbe. */
  variant: string
  /** Neutral-Palette (NEUTRAL_REGISTRY-Id) oder '' = Instanz-Voreinstellung. */
  neutral: string
}

export function useTenantBranding() {
  const branding = useState<TenantBrandingSelection | null>('pukalani-tenant-branding', () => null)
  /** true = dieser Host gehört einer Community (nur dann ist die Wahl sinnvoll). */
  const isTenantHost = computed(() => branding.value !== null)
  return { branding, isTenantHost }
}
