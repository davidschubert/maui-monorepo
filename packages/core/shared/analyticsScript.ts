/**
 * Die Form einer Plausible-Script-Id — und die EINE Regel, wie daraus eine
 * Script-Adresse wird.
 *
 * WARUM IM CORE UND NICHT IM analytics-LAYER: gerendert wird der Eintrag hier
 * (app/plugins/analytics.ts), geprüft wird die Eingabe dort. Zwei Kopien
 * derselben Regel wären genau der Zustand, in dem das Dashboard eine Vorschau
 * zeigt, die der Head später anders baut. Der Produkt-Layer importiert diese
 * Datei (Fundament → erlaubt, A14); umgekehrt kennt der Core den Layer nie.
 *
 * WARUM ÜBERHAUPT EINE ID UND KEINE URL: der Wert landet als `<script src>` in
 * JEDER Seite einer Kunden-Community — auf einem Host, dessen Cookies unsere
 * Session tragen. Eine freie Adresse wäre die Erlaubnis, dort fremden Code
 * auszuführen. Der Zeichenvorrat unten kennt weder `.` noch `/` noch `:`, kann
 * also per Konstruktion keine fremde Herkunft benennen; die Basis-Adresse
 * kommt aus `pukalani.analytics.instance` (App-Config, nicht aus der Eingabe).
 */

/**
 * `pa-` + 8–80 URL-sichere Zeichen, oder '' (= Analytics aus).
 * Plausible v3 vergibt heute 21 Zeichen (nanoid); die Spanne lässt künftigen
 * Längen Luft, ohne die Form aufzuweichen.
 */
export const ANALYTICS_SCRIPT_ID_RE = /^$|^pa-[A-Za-z0-9_-]{8,80}$/

/** PURE (unit-getestet): ist das eine akzeptable Script-Id? ('' = ja, aus.) */
export function isPlausibleScriptId(value: unknown): value is string {
  return typeof value === 'string' && ANALYTICS_SCRIPT_ID_RE.test(value)
}

/**
 * PURE (unit-getestet): Script-Adresse aus Instanz-Basis + Id.
 *
 * '' zurück, sobald eines von beiden fehlt oder die Id nicht der Form
 * entspricht — der Aufrufer rendert dann NICHTS. Ein Rückfall auf eine
 * Vorgabe-Adresse wäre hier falsch: er würde beim leeren Feld stillschweigend
 * doch messen.
 */
export function plausibleScriptUrl(instance: string | undefined, scriptId: string | undefined): string {
  if (!instance || !scriptId) return ''
  if (!isPlausibleScriptId(scriptId)) return ''
  return `${instance.replace(/\/+$/, '')}/js/${scriptId}.js`
}
