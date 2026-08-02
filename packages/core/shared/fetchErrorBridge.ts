/**
 * DIE BRÜCKE ZWISCHEN DEM EINEN `$fetch` UND DER OBERFLÄCHE.
 *
 * WOZU: eine abgewiesene Antwort soll dem Menschen EINMAL zentral erklärt
 * werden können (heute: die Sperre einer Community, M13). Der einzige Ort, durch
 * den JEDER Schreibvorgang aller Produkt-Layer läuft, ist `$fetch` — aber genau
 * an den kommt man zur Laufzeit nicht mehr heran:
 *
 *   Nuxt erzeugt `#build/fetch.mjs` mit
 *     if (!globalThis.$fetch) globalThis.$fetch = _$fetch.create({ baseURL })
 *     export const $fetch = globalThis.$fetch
 *   Der Export ist eine KONSTANTE — eine Momentaufnahme des Objekts, wie es beim
 *   Auswerten dieses Moduls war. Auto-importiertes `$fetch` in einer Komponente
 *   ist dieser Export. `globalThis.$fetch` in einem Plugin zu ERSETZEN, wirkt
 *   deshalb NICHT: das Modul ist längst ausgewertet, die Komponenten halten das
 *   alte Objekt. (Live nachgemessen 2026-08-03: ein Konsolen-Aufruf über
 *   `globalThis.$fetch` lief durch die Ersetzung, derselbe Aufruf aus dem
 *   PostComposer nicht. Ein Interceptor-Plugin sieht in einem Review richtig aus
 *   und feuert nur manchmal — schlimmer als keiner.)
 *
 * DESHALB EINE STELLE FRÜHER: `packages/core/nuxt.config.ts` hängt sich in den
 * `app:templates`-Hook und legt den Interceptor IN die Vorlage, bevor sie
 * ausgewertet wird. Die Vorlage kennt aber weder Toasts noch Sprachen — sie ruft
 * nur den Haken, dessen Namen diese Datei festlegt. Wer ihn setzt, ist ein ganz
 * gewöhnliches Client-Plugin (community-suspended-notice.client.ts).
 *
 * WARUM DER NAME HIER STEHT UND NICHT ZWEIMAL ALS STRING: die Vorlage ist ein
 * Text in der nuxt.config, das Plugin ist TypeScript. Zwei abgeschriebene
 * Schlüssel wären ein Tippfehler ohne Fehlermeldung — es passierte einfach
 * nichts.
 */

/** Globaler Haken: `(context) => void`, gesetzt vom Client-Plugin. */
export const FETCH_ERROR_HOOK = '__pukalaniFetchError'

/** Was der Haken bekommt — der ofetch-Kontext, auf das Nötigste verengt. */
export interface FetchErrorNotice {
  status: number
  /** Der geparste Antwort-Körper: unser Fehler-Envelope (core/server/error.ts). */
  reason: string
}
