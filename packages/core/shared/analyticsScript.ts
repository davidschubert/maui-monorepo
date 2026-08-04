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

/** Die gespeicherte Einstellung EINER Community — nur, was hier zählt. */
export interface AnalyticsSettingsLike {
  /** Eigene Plausible-Site der Community ('' = keine). */
  plausibleScriptId?: string
  /** Schalter „Messung aktiv" (v2) — zielt auf die Sammel-Site. */
  enabled?: boolean
}

/** Die Sammel-Site des Deployments (`pukalani.analytics.shared`). */
export interface AnalyticsSharedSite {
  /** Script-Id der Sammel-Site ('' = dieses Deployment hat keine). */
  scriptId?: string
}

/**
 * PURE (unit-getestet): WELCHE Script-Id lädt diese Community wirklich?
 *
 * Zwei Wege führen zur Messung, und sie schließen einander nicht aus — deshalb
 * braucht es eine Rangfolge, und zwar an EINER Stelle (der Head-Eintrag, die
 * Dashboard-Vorschau und die Statistik müssen dasselbe rechnen):
 *
 *  1. EIGENE SITE (`plausibleScriptId`, das v1-Feld, im Dashboard unter
 *     „Erweitert") GEWINNT IMMER. Sie ist die spezifischere Aussage: wer sich
 *     die Mühe einer eigenen Plausible-Site macht, will seine Zahlen für sich
 *     — nicht zusätzlich, sondern STATT der Sammel-Site. Zwei Scripts auf
 *     derselben Seite wären außerdem doppelt gezählte Besuche.
 *  2. Sonst der SCHALTER: `enabled` an UND das Deployment hat eine Sammel-Site.
 *     Ohne Sammel-Site (Silo, lokale Entwicklung) ist der Schalter wirkungslos
 *     — es gäbe keine Site, in die gemessen werden könnte.
 *  3. Sonst nichts. Kein Rückfall auf irgendeine Vorgabe: „aus" heißt aus.
 *
 * WARUM DIE SAMMEL-SITE ÜBERHAUPT (2026-08-04): die Plausible-CE hat keine
 * Sites-API (Enterprise-only, am Quellcode geprüft) — wir können pro Community
 * keine Site anlegen lassen. Also tracken alle Pool-Communities in EINE Site,
 * und die Zahlen je Community holt unsere Stats-Route über den
 * `event:hostname`-Filter. Die Trennung ist damit eine ABFRAGE-Grenze, keine
 * Speicher-Grenze — das ist der bewusst gezahlte Preis dieser Bauweise.
 *
 * Beide Ids laufen durch `isPlausibleScriptId`: der Rückgabewert wird zu einem
 * `<script src>`, und das gilt auch für einen Wert aus der App-Config.
 */
export function effectiveScriptId(
  row: AnalyticsSettingsLike | null | undefined,
  shared: AnalyticsSharedSite,
): string {
  const own = row?.plausibleScriptId ?? ''
  if (own && isPlausibleScriptId(own)) return own

  const sharedId = shared.scriptId ?? ''
  if (row?.enabled === true && sharedId && isPlausibleScriptId(sharedId)) return sharedId

  return ''
}
