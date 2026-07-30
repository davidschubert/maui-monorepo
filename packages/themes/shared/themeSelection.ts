/**
 * WER BESTIMMT DIE FARBWELT EINER SEITE? (Davids Entscheidung 2026-07-29,
 * OPEN-ITEMS B5) — eine pure Rechnung, drei mögliche Quellen.
 *
 * Bis dahin gewann IMMER das Cookie des Besuchers. Auf einem Mandanten-Host
 * (`name.pukalani.app`) war das ein Bruch des Produktversprechens („unter
 * deinem Namen und deinem Design"): wer sich irgendwann auf irgendeiner
 * Pukalani-Seite ein Theme ausgesucht hatte, sah damit JEDE Community in
 * seinen Farben — und zwei Besucher sahen dieselbe Community verschieden.
 *
 * NEUE REGEL: auf einem Mandanten-Host gewinnt die Community, immer.
 *   - `branding = { theme: 'crimson', … }` → die Community hat gewählt.
 *   - `branding = { theme: '', … }`        → Mandanten-Host OHNE eigene Wahl:
 *                                            die Instanz-Einstellung gilt (sie
 *                                            IST dort die Farbe der Community).
 *   - `branding = null`                    → KEIN Mandanten-Host (Silo-App,
 *                                            Kontroll-Host, Playground): dort
 *                                            gehört die Optik der Instanz und
 *                                            der Besucher darf weiter wählen.
 * (Die drei Zustände kommen unverändert aus `useTenantBranding()`, core.)
 *
 * NICHT betroffen ist Hell/Dunkel: das Farbschema bleibt in JEDEM Fall die
 * Wahl des Besuchers (`useColorMode`, eigener Cookie) — hier geht es nur um
 * `data-theme`/`data-variant`.
 *
 * WARUM PUR UND IN `shared/`: die Vorrangregel ist die Antwort auf „warum ist
 * diese Seite blau", und sie muss an EINER Stelle stehen und prüfbar sein
 * (tests/themeSelection.test.ts). `useTheme()` legt nur noch Cookies und
 * Registry-Validierung darum.
 */

/** Wahl der Community, wie `useTenantBranding()` sie liefert. */
export interface CommunityBranding {
  /** Built-in-Theme-Id oder '' = Instanz-Einstellung. */
  theme: string
  /** Tonale Variante oder '' = Basisfarbe. */
  variant: string
}

/** Wessen Wahl hat gewonnen — für Tests, UI-Entscheidungen und Debugging. */
export type ThemeSource = 'visitor' | 'community' | 'instance'

export interface ThemeSelectionInput {
  /** Theme-Cookie des Besuchers (null = keins). */
  cookieTheme: string | null
  /** Varianten-Cookie des Besuchers (null = keins). */
  cookieVariant: string | null
  /** Wahl der Community; null = kein Mandanten-Host. */
  branding: CommunityBranding | null
  /** Instanz-Einstellung (`app_config.themeSettings.defaultThemeId`). */
  instanceTheme?: string | null
  /** Instanz-Variante (`…defaultVariantId`). */
  instanceVariant?: string | null
}

export interface ThemeSelectionResult {
  /** Gewünschte Theme-Id; '' = keine Vorgabe → Aufrufer nimmt den Registry-Default. */
  theme: string
  /** Gewünschte Variante; '' = Basisfarbe. */
  variant: string
  source: ThemeSource
}

/**
 * Darf der BESUCHER die Farbwelt dieser Seite umstellen? Genau dann, wenn er
 * nicht auf einem Mandanten-Host steht. Ist das false, verschwindet der
 * Theme-Eintrag aus dem Anzeige-Menü — ein Wähler, der nichts bewirkt, wäre
 * eine Lüge im UI (und „nur für dich" wäre die falsche Beschriftung: die Wahl
 * hätte auch für ihn selbst keine Wirkung mehr).
 */
export function visitorMayChooseTheme(branding: CommunityBranding | null): boolean {
  return branding === null
}

export function resolveThemeSelection(input: ThemeSelectionInput): ThemeSelectionResult {
  const instanceTheme = input.instanceTheme ?? ''
  const instanceVariant = input.instanceVariant ?? ''

  // Mandanten-Host: das Cookie des Besuchers wird GAR NICHT gelesen. Es bleibt
  // stehen (er nimmt seine Wahl mit, wenn er wieder auf einem Host landet, wo
  // sie gilt) — es gewinnt nur nicht mehr.
  if (input.branding !== null) {
    return input.branding.theme
      ? { theme: input.branding.theme, variant: input.branding.variant, source: 'community' }
      : { theme: instanceTheme, variant: instanceVariant, source: 'instance' }
  }

  // Kein Mandanten-Host: Cookie → Instanz-Einstellung → Registry-Default.
  if (input.cookieTheme) {
    return { theme: input.cookieTheme, variant: input.cookieVariant ?? '', source: 'visitor' }
  }
  // Nur eine Variante gewählt (Theme = Instanz-Einstellung): das bleibt eine
  // Besucher-Wahl und schlägt die Instanz-Variante.
  if (input.cookieVariant) {
    return { theme: instanceTheme, variant: input.cookieVariant, source: 'visitor' }
  }
  return { theme: instanceTheme, variant: instanceVariant, source: 'instance' }
}
