import { THEME_REGISTRY, DEFAULT_THEME_ID, NEUTRAL_REGISTRY } from '../app/utils/themeRegistry'

/**
 * Validierungs-Quelle für die Theme-Wahl EINES MANDANTEN (Davids Entscheidung
 * 12 vom 2026-07-28: „nur Erscheinung ist variabel" gehört in Kundenhand).
 *
 * WARUM HIER UND NICHT IM CONTROL PLANE: die Wahrheit über gültige Themes ist
 * der generierte Katalog (theme.catalog.ts → themeRegistry.gen.ts). Eine
 * zweite, handgepflegte Liste im Control Plane wäre am Tag der ersten
 * Katalog-Änderung falsch. Dieses Modul ist deshalb nur eine dünne, PURE
 * Schicht über THEME_REGISTRY — kein eigenes Wissen, keine eigenen Farben.
 *
 * WARUM `shared/` UND NICHT `app/utils/`: die Prüfung läuft SERVERSEITIG in
 * zwei anderen Paketen (onboarding-Naht + Control Plane). `app/utils/` ist
 * Nuxt-Auto-Import-Gebiet; dieses Modul ist reines TypeScript ohne Nuxt-,
 * Vue- oder Appwrite-Abhängigkeit und deshalb von überall importierbar
 * (auch aus Vitest ohne Nuxt-Umgebung). THEME_REGISTRY selbst ist bereits
 * pur — es importiert ausschließlich Daten + Typen.
 *
 * CUSTOM THEMES SIND HIER BEWUSST NICHT GÜLTIG. `custom_themes` ist eine
 * Tabelle PRO APPWRITE-PROJEKT; im Pool teilen sich alle Communities dasselbe
 * Projekt. Ein Mandant, der `c-<rowId>` wählen dürfte, würde sich an ein
 * Objekt hängen, das ihm nicht gehört und das der Betreiber jederzeit löscht.
 * Für Pool-Kunden gilt darum der Built-in-Katalog; der Custom-Theme-EDITOR
 * bleibt Betreiber-Werkzeug (/dashboard/themes, system.manage).
 */

/** Zurücksetzen auf die Instanz-Einstellung (`app_config.themeSettings`):
 *  `tenants.theme = ''` ist der Zustand „nie etwas gewählt" und bleibt ein
 *  gültiges Ziel, damit eine Community die eigene Wahl wieder aufgeben kann. */
export const INHERIT_THEME = ''

/** Alle wählbaren Built-in-Theme-Ids (inkl. `default` = Maui-Grundzustand). */
export function builtinThemeIds(): string[] {
  return THEME_REGISTRY.map(entry => entry.id)
}

export function isBuiltinTheme(id: string): boolean {
  return THEME_REGISTRY.some(entry => entry.id === id)
}

/** Die tonalen Varianten GENAU DIESES Themes ('' = Basisfarbe, immer gültig). */
export function builtinVariantIds(themeId: string): string[] {
  return THEME_REGISTRY.find(entry => entry.id === themeId)?.variants.map(v => v.id) ?? []
}

/**
 * Ist das Paar {theme, variant} eine gültige Mandanten-Wahl?
 *
 * Fail-closed: unbekanntes Theme → nein. Eine Variante wird gegen die
 * Varianten GENAU DIESES Themes geprüft — `crimson/ink` ist so wenig gültig
 * wie ein erfundener Name, denn die CSS-Regel
 * `[data-theme='crimson'][data-variant='ink']` existiert nicht und die Seite
 * fiele still auf die Basisfarbe zurück (ein Fehler, der niemandem auffällt).
 *
 * `variant: ''` heißt „Basisfarbe der Welt" und ist bei jedem Theme gültig.
 * `theme: ''` (INHERIT_THEME) heißt „Instanz-Einstellung" und verlangt dann
 * auch eine leere Variante — eine Variante ohne Theme wäre bedeutungslos.
 */
export function isBuiltinThemeSelection(theme: string, variant: string): boolean {
  if (theme === INHERIT_THEME) return variant === ''
  if (!isBuiltinTheme(theme)) return false
  return variant === '' || builtinVariantIds(theme).includes(variant)
}

/**
 * Wählbare Neutral-Paletten EINES MANDANTEN (Davids Entscheidung vom
 * 2026-07-29, Rest von B5: die Palette folgt der Community).
 *
 * Quelle ist `NEUTRAL_REGISTRY` — dieselbe Liste, die das Anzeige-Menü zeigt.
 * Die GETÖNTE Ramp eines Custom Themes ('c-<rowId>') ist hier bewusst NICHT
 * gültig, aus genau dem Grund, aus dem Custom Themes es nicht sind: sie hängt
 * an einer Row der `custom_themes`-Tabelle, die PRO APPWRITE-PROJEKT existiert
 * und die der Betreiber jederzeit löscht.
 */
export function builtinNeutralIds(): string[] {
  return NEUTRAL_REGISTRY.map(entry => entry.id)
}

/** `''` = „keine eigene Wahl" (Instanz-Voreinstellung) und immer gültig. */
export function isBuiltinNeutralSelection(neutral: string): boolean {
  return neutral === '' || NEUTRAL_REGISTRY.some(entry => entry.id === neutral)
}

/** Anzeigename eines Built-ins (für Dashboard-Texte); '' → unbekannt. */
export function builtinThemeName(id: string): string {
  return THEME_REGISTRY.find(entry => entry.id === id)?.name ?? ''
}

export { DEFAULT_THEME_ID }
