/**
 * DER SPIEGEL DES COMMUNITY-BRANDINGS (D6, 2026-08-01) — ein Vertrag, drei
 * Zeilen Rechnung.
 *
 * DAS PROBLEM: die WAHRHEIT über Theme/Variante/Palette einer Community steht
 * in der `communities`-Row des CONTROL-PLANE-Projekts. Dort hat der Browser
 * weder Session noch Leserecht — er kann sie also weder abfragen noch
 * abonnieren. Custom Themes, Schriften und die Instanz-Einstellungen morphen
 * seit jeher live, weil sie im RUNTIME-Projekt liegen und `read(any)` sind;
 * die Farbe der Community war die eine Ausnahme und erreichte offene Fenster
 * erst beim nächsten Seitenaufbau (≤30 s Resolver-Cache).
 *
 * DIE LÖSUNG: eine winzige Tabelle im RUNTIME-Projekt, EINE Row pro Community
 * (rowId = `communities.$id` = `useSiteId()`), `read(any)` wie `app_config` —
 * geschrieben ausschliesslich server-seitig, direkt nachdem das Control Plane
 * den Schreibvorgang bestätigt hat. Der Client abonniert GENAU SEINE Row
 * (`Channel…row(<communityId>)`) und schreibt das Ergebnis in
 * `useTenantBranding()`; die Vorrangregel (`resolveThemeSelection`) und die
 * Head-Mechanik bleiben unangetastet.
 *
 * WARUM NICHT `app_config`: die Tabelle ist per Vertrag EINE Row pro PROJEKT
 * ('global') — im Pool teilen sich alle Communities sie. Ein zweiter Row-Sinn
 * darin wäre genau die Verwechslung, die O5 schon einmal aufgelöst hat
 * (`app_config.themeSettings` ist instanzweit, deshalb hängt die Wahl der
 * Kundin am Mandanten). Ausserdem hören dort zwei Plugins zu, die jedes Event
 * als Instanz-Änderung deuten.
 *
 * BEIM ANLEGEN WIRD NICHT GESPIEGELT — und das ist richtig so (nachgemessen
 * 2026-08-03). `onboardingProvision.ts` schreibt `theme`/`variant` in die
 * frische `communities`-Row, ohne eine Spiegel-Zeile anzulegen; die entsteht
 * erst beim ersten Branding-PATCH. Eine Lücke fürs erste Live-Morphen ist das
 * NICHT: der Abonnent hängt am Row-Kanal, auch wenn es die Zeile noch gar
 * nicht gibt, und `createRow` publiziert dort ein Event (live gegen Appwrite
 * 1.9.6 geprüft — anders als `upsertRow`, s. u.). Die erste Farbwahl morpht
 * also offene Fenster wie jede spätere. Nachrüsten liesse es sich ohnehin
 * nicht ohne neue Naht: `onboardingProvision` läuft im CONTROL-Projekt und hat
 * keinen Schlüssel fürs Runtime-Projekt.
 *
 * DER SPIEGEL IST BEQUEMLICHKEIT, NICHT WAHRHEIT. Er wird NIE gelesen, um eine
 * Seite zu rendern — SSR fragt weiter den Resolver. Scheitert das Spiegeln,
 * passiert nichts Schlimmes: die Änderung ist im Control Plane gespeichert und
 * der nächste Seitenaufbau zeigt sie (≤30 s). Deshalb schreibt der Spiegel
 * fail-soft und es gibt bewusst KEINEN Abgleich-Job.
 *
 * DER SPIEGEL IST ÖFFENTLICH UND AUFZÄHLBAR — geprüft und akzeptiert (Befund 5
 * des M13-Wechselwirkungs-Audits, 2026-08-03). `read(any)` +
 * `rowSecurity: false` heisst nicht nur „jeder darf SEINE Row abonnieren",
 * sondern auch: ein anonymer Client kann die TABELLE auflisten und bekommt die
 * Row-Ids und Farben ALLER Communities, auch der members-only und der
 * gesperrten. Live nachgemessen, kein Verdacht.
 *
 * WARUM DAS SO BLEIBT, in der Reihenfolge der Wichtigkeit:
 *  1. WAS dort steht, trägt nichts: eine undurchsichtige Row-Id und drei
 *     Farb-Tokens, die ohnehin als data-theme/-variant/-neutral im HTML jeder
 *     Seite dieser Community stehen. Kein Name, kein Host, keine
 *     Mitgliedschaft — und ohne den Host lässt sich eine Id keiner Community
 *     zuordnen. Aufzählbar ist damit die ANZAHL, nicht die Identität.
 *  2. Appwrite kennt kein Recht, das Lesen erlaubt und Auflisten verbietet.
 *     „Nicht aufzählbar" hiesse hier: kein Leserecht, also kein Live-Morphen —
 *     der Spiegel hätte keinen Zweck mehr. Es gibt nichts zu härten, nur zu
 *     entfernen.
 *  3. Es ist dieselbe bewusste Bauart wie bei den zwei Schwestern `app_config`
 *     (system-005) und `custom_themes` (system-013); letztere trägt sogar
 *     NAMEN. Nur die jüngste der drei zuzumachen, änderte die Klasse nicht.
 *  4. „Beim Sperren räumen" klingt billig und ist es nicht: die Sperre
 *     entsteht im CONTROL-Projekt, der Spiegel liegt im RUNTIME-Projekt, und
 *     einen Schlüssel in diese Richtung gibt es bewusst NICHT (derselbe Grund,
 *     aus dem `revokeCommunityLabel` in der Runtime läuft). Eine neue
 *     Service-Naht für drei Farbwörter wäre teurer als das, was sie schützt —
 *     und eine Naht mehr, die falsch laufen kann.
 *
 * DIE BEDINGUNG DER ABWÄGUNG: sie gilt NUR, solange hier ausschliesslich
 * Farb-Tokens liegen. Eine Spalte mit Name, Host oder sonst etwas
 * Identifizierendem macht aus der harmlosen Aufzählung ein echtes Leck.
 * Deshalb steht das nicht nur hier: Abschnitt 12 von
 * `packages/onboarding/scripts/verify-site-branding.mjs` listet die Tabelle
 * ANONYM und geht rot, sobald ein Feld ausserhalb der drei auftaucht.
 *
 * KEINE INJEKTIONSFLÄCHE: die Werte durchlaufen VOR dem Spiegeln zweimal den
 * Katalog (`isBuiltinThemeSelection`/`isBuiltinNeutralSelection`) und den
 * attribut-sicheren Token-Wächter (`isSafeThemeToken`), die Tabelle hat kein
 * write-Recht für Clients, und der Leser validiert am Ende NOCH einmal gegen
 * die Registry (`useTheme()` findet ein Theme oder fällt auf den Default). Was
 * hier durchkommt, kann nie roh in einem `data-`Attribut landen.
 */

/** Tabelle im RUNTIME-Projekt (Schema-Owner: system, Migration system-028). */
export const COMMUNITY_BRANDING_TABLE = 'community_branding'

/** Die drei Felder, wie sie `communities` führt — '' = keine eigene Wahl. */
export interface CommunityBrandingValues {
  theme: string
  variant: string
  neutral: string
}

/** Row des Spiegels, so wie sie im Realtime-Payload ankommt. */
export interface CommunityBrandingMirrorRow {
  $id: string
  theme?: string | null
  variant?: string | null
  neutral?: string | null
}

/**
 * Row → Wahl der Community. `null`/fehlend wird zu '' — genau wie im
 * SSR-Spiegel (`tenant-brand.server.ts`), denn Appwrite backfillt Defaults
 * nicht und '' ist der Zustand „nichts gewählt, Instanz-Einstellung gilt".
 */
export function mirrorRowToBranding(row: CommunityBrandingMirrorRow): CommunityBrandingValues {
  return {
    theme: row.theme ?? '',
    variant: row.variant ?? '',
    neutral: row.neutral ?? '',
  }
}

/**
 * Gehört diese Spiegel-Row auf diesen Host? SICHERHEITSNETZ neben der
 * Row-Subscription (dieselbe Bauart wie `rowBelongsToHost`): der Kanal liefert
 * schon nur die eigene Row, aber ein Tippfehler im Kanalbau oder ein künftiger
 * Table-weiter Abonnent würde sonst fremde Farben durchreichen. Fail-closed in
 * beide Richtungen — ohne bekannte Community-Id gilt keine Row.
 */
export function mirrorBelongsToCommunity(
  row: CommunityBrandingMirrorRow,
  communityId: string | null,
): boolean {
  return !!communityId && row.$id === communityId
}
