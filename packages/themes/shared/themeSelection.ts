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
 * DIE NEUTRAL-PALETTE FOLGT SEIT DEM 2026-07-29 DERSELBEN REGEL (Davids
 * Entscheidung, Rest von B5): `data-neutral` ist eine EIGENE Achse (die gedeckte
 * Grau-Tönung, `NEUTRAL_REGISTRY`), sie blieb aber nur deshalb Besucher-Wahl,
 * weil es dafür keine Community-Einstellung gab. Es gibt sie jetzt
 * (`tenants.neutral`, Migration control-020) — also gilt hier dasselbe:
 * Mandanten-Host ⇒ die Community, sonst ⇒ der Besucher. Bewusst eine EIGENE
 * Funktion (`resolveNeutralSelection`) und kein viertes Feld im Theme-Ergebnis:
 * die Herkunft kann auseinanderlaufen (auf einem Instanz-Host darf der Besucher
 * die Palette gewählt haben, während das Theme aus der Instanz-Einstellung
 * kommt) — ein gemeinsames `source` wäre dann eine Lüge.
 *
 * NICHT betroffen ist Hell/Dunkel: das Farbschema bleibt in JEDEM Fall die
 * Wahl des Besuchers (`useColorMode`, eigener Cookie) — hier geht es nur um
 * `data-theme`/`data-variant`/`data-neutral`. Die Sprache ebenso.
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
  /**
   * Neutral-Palette (`NEUTRAL_REGISTRY`-Id) oder '' = keine eigene Wahl.
   *
   * OPTIONAL, und das ist Absicht: die Theme-Rechnung liest dieses Feld nie
   * (getrennte Achse), und „Feld fehlt" bedeutet genau dasselbe wie '' — keine
   * Wahl. So bleibt jede Fixture/jeder Aufrufer gültig, der nur über Theme und
   * Variante redet.
   */
  neutral?: string
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

/**
 * Darf der BESUCHER die Neutral-Palette umstellen? Dieselbe Frage, dieselbe
 * Antwort — bewusst als eigener Name, weil sie an anderen Stellen im UI
 * gestellt wird (Untermenü „Neutral", Schnell-Umschalter im Theme-Studio) und
 * weil beide Achsen auseinanderlaufen könnten, ohne dass jemand zwei
 * Aufrufstellen suchen muss. EIN Regelkörper, zwei Fragen.
 */
export function visitorMayChooseNeutral(branding: CommunityBranding | null): boolean {
  return visitorMayChooseTheme(branding)
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

export interface NeutralSelectionInput {
  /** Neutral-Cookie des Besuchers (null = keins). */
  cookieNeutral: string | null
  /** Wahl der Community; null = kein Mandanten-Host. */
  branding: CommunityBranding | null
}

export interface NeutralSelectionResult {
  /**
   * Gewünschte Palette-Id; '' = keine Vorgabe → der Aufrufer nimmt seine eigene
   * Fallback-Kette (getönte Ramp des aktiven Themes, sonst
   * `DEFAULT_NEUTRAL_ID`). Genau wie `theme: ''` oben.
   */
  neutral: string
  source: ThemeSource
}

/**
 * Wessen Neutral-Palette gilt? Dieselbe Vorrangregel wie beim Theme, auf der
 * eigenen Achse:
 *   - Mandanten-Host MIT Wahl   → die Community (`tenants.neutral`).
 *   - Mandanten-Host OHNE Wahl  → '' = die Instanz zeigt, was sie zeigt; das
 *                                 Neutral-Cookie wird auch hier NICHT gelesen
 *                                 (sonst sähen zwei Besucher dieselbe Community
 *                                 verschieden — der ganze Punkt von B5).
 *   - kein Mandanten-Host       → Cookie des Besuchers, sonst ''.
 *
 * Es gibt für die Palette bewusst KEINE Instanz-Einstellung (kein
 * `themeSettings.defaultNeutralId`): der Betreiber-Default IST die Registry-
 * Voreinstellung bzw. die getönte Ramp des aktiven Themes. Ein weiterer Regler
 * wäre ein Regler mehr, ohne eine Frage zu beantworten, die jemand hat
 * (docs/referenz/THEMES-CONCEPT-V2.md, „Einfachheit ist Leitprinzip").
 */
export function resolveNeutralSelection(input: NeutralSelectionInput): NeutralSelectionResult {
  if (input.branding !== null) {
    const chosen = input.branding.neutral ?? ''
    return chosen
      ? { neutral: chosen, source: 'community' }
      : { neutral: '', source: 'instance' }
  }
  return input.cookieNeutral
    ? { neutral: input.cookieNeutral, source: 'visitor' }
    : { neutral: '', source: 'instance' }
}
