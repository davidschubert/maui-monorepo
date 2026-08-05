/**
 * Die beiden `useFetch`-Schlüssel der Discussions-Ansicht.
 *
 * WARUM SIE HIER STEHEN und nicht als Zeichenkette an drei Stellen: sie werden
 * über eine LAYER-GRENZE hinweg gebraucht. Die Seiten liegen in `blueprint`
 * (Komposition, A14), die Liste und der Eröffnen-Knopf in `posts` — und beide
 * Seiten sprechen über genau diese Schlüssel miteinander:
 *
 *  - `CATEGORY_LIST_KEY`: die Kategorie-SEITE holt die Liste ohnehin (sie muss
 *    den Slug auflösen), der Eröffnen-Knopf braucht dieselbe Liste (er muss aus
 *    dem Slug die Row-Id machen). Gleicher Schlüssel = EIN Request, geteilter
 *    SSR-Payload. Nuxt leitet den automatischen Schlüssel aus der AUFRUFSTELLE
 *    ab — zwei Aufrufstellen bekämen also zwei Requests, obwohl sie dasselbe
 *    fragen.
 *  - `DISCUSSION_TOPICS_KEY`: der Knopf steht in der Seiten-Kopfzeile, die
 *    Liste daneben — sie sind Geschwister, kein Eltern-Kind-Paar. Nach dem
 *    Eröffnen frischt der Knopf die Liste über `refreshNuxtData(KEY)` auf,
 *    statt ein Ereignis durch die Seite zu fädeln oder die Tabelle per `:key`
 *    neu zu montieren (das warf Sortierung, Filter und Nachladestand weg).
 *
 * ACHTUNG, der Schlüssel trägt die QUERY NICHT: `CATEGORY_LIST_KEY` gilt für
 * die Abfrage MIT `all=1`. Wer ihn für eine andere Query benutzt, bekommt den
 * Payload der ersten Abfrage zurück — deshalb steht die Bedingung hier und
 * nicht nur im Kopf desjenigen, der es gerade schreibt.
 */

/** Alle Kategorien der Community, `?all=1` (auch stillgelegte). */
export const CATEGORY_LIST_KEY = 'posts-categories-all'

/** Die Topic-Liste der Discussions-Ansicht (eine je Seite). */
export const DISCUSSION_TOPICS_KEY = 'posts-discussion-topics'
