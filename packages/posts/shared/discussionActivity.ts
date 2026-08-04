/**
 * WANN WAR HIER ZULETZT ETWAS LOS? — die Rückfall-Kette der Spalte „Aktivität"
 * (F1 Stufe 2).
 *
 * Die Wahrheit steht seit Migration posts-009 in `community_posts.lastActivityAt`:
 * gesetzt beim Veröffentlichen, nachgezogen bei jeder Antwort (Core-Vertrag
 * `notifyContentActivity`). Zwei Fälle brauchen trotzdem einen Rückfall, und
 * beide sind echt, nicht theoretisch:
 *
 *  1. **BESTAND.** Die Migration backfillt alle vorhandenen Zeilen — aber ein
 *     Backfill über eine gepoolte Tabelle ist eine Schleife, keine Transaktion.
 *     Bleibt eine Zeile stehen (Abbruch, Timeout, eine Community, die zwischen
 *     Migration und Deploy schreibt), stünde in der Spalte sonst „—".
 *  2. **DAS FENSTER ZWISCHEN MIGRATION UND DEPLOY.** Die Reihenfolge ist
 *     Migration zuerst; in den Minuten dazwischen legt der ALTE Code Beiträge
 *     ohne `lastActivityAt` an. Die SORTIERUNG kann dieser Rückfall nicht
 *     heilen (Appwrite kann kein COALESCE) — die ANZEIGE schon, und eine
 *     falsche Reihenfolge für ein paar Minuten ist harmlos, eine leere Zelle
 *     sieht nach Fehler aus.
 *
 * `publishedAt` VOR `$updatedAt`, und das ist die eigentliche Aussage dieser
 * Datei: `$updatedAt` bewegt sich bei JEDER Stimme (score.post.ts schreibt die
 * Zähler auf die Zeile) und bei jedem Tippfehler-Fix. Genau deshalb wurde die
 * Spalte gebaut. `$updatedAt` steht hier nur als allerletzter Notnagel, damit
 * die Funktion immer einen Zeitstempel liefert und die Oberfläche keine
 * Sonderbehandlung für „gar nichts" braucht.
 *
 * PURE (unit-getestet, mit Gegenproben): Server (Listen-Anreicherung) und
 * jeder künftige Leser rechnen dieselbe Kette.
 */

export interface TopicActivitySource {
  /** Nachgezogene Aktivität (posts-009). null = Bestand oder noch nie gesetzt. */
  lastActivityAt?: string | null
  /** Veröffentlichungszeitpunkt. null bei geplanten Beiträgen. */
  publishedAt?: string | null
  /** Appwrite-Zeitstempel der Zeile — immer vorhanden. */
  $updatedAt: string
}

/** Der Zeitstempel, den die Spalte „Aktivität" zeigt. */
export function topicActivityAt(row: TopicActivitySource): string {
  return row.lastActivityAt || row.publishedAt || row.$updatedAt
}
