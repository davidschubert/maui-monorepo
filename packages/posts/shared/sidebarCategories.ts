/**
 * „MEINE LETZTEN KATEGORIEN" — die Rechnung dahinter (F1 Stufe 3, Stück 4).
 *
 * PURE (unit-getestet). Sie steht getrennt von der Route, weil sie genau die
 * Aussage ist, an der Stufe 2 gescheitert war: Beiträge und Kommentare auf
 * EINER Zeitachse. Solange das in einer Route steckt, kann man nicht zeigen,
 * dass die Reihenfolge stimmt — man kann es nur behaupten.
 *
 * EINE BERÜHRUNG ist „ich habe hier etwas getan": ein Beitrag, den ich
 * eröffnet, oder ein Kommentar, den ich geschrieben habe. Beide zählen GLEICH
 * — das ist Davids Entscheidung 7 („gepostet ODER kommentiert"), und es ist
 * auch das Ehrliche: die Seitenleiste beantwortet „wo war ich zuletzt?", nicht
 * „wo habe ich am meisten geleistet".
 *
 * BEWUSST KEINE GEWICHTUNG. Naheliegend wäre, einen eigenen Beitrag höher zu
 * werten als einen Kommentar. Dann wäre die Liste aber keine Zeitachse mehr,
 * sondern eine Rangliste mit zwei nicht vergleichbaren Skalen — genau der
 * Fehler, den der Kopf der Stufe-2-Route beschreibt („wer heute fünfzig
 * Beiträge schreibt und gestern einmal kommentiert hat, bekäme die gestrige
 * Kategorie nach vorn"). Was zuletzt war, war zuletzt.
 */

export interface CategoryTouch {
  categoryId: string
  /** ISO-Zeitpunkt der Berührung. */
  at: string
}

/**
 * Die zuletzt berührten Kategorien, neueste zuerst, ohne Wiederholung.
 *
 * Leere Kategorie-Ids fallen heraus: ein Beitrag ohne Kategorie lebt im Feed
 * und gehört in keine Struktur (derselbe Grund, aus dem die Themen-Liste ihn
 * nicht zeigt).
 */
export function recentCategoryIds(touches: readonly CategoryTouch[], limit: number): string[] {
  if (limit <= 0) return []

  /**
   * Je Kategorie zählt die JÜNGSTE Berührung — nicht die erste, die in der
   * Liste auftaucht. Der Aufrufer führt zwei Quellen zusammen, deren
   * Reihenfolge er nicht garantieren kann; sich auf sie zu verlassen hieße,
   * die Sortierung dem Zufall der Zusammenführung zu überlassen.
   */
  const newest = new Map<string, string>()
  for (const touch of touches) {
    if (!touch.categoryId || !touch.at) continue
    const known = newest.get(touch.categoryId)
    if (!known || touch.at > known) newest.set(touch.categoryId, touch.at)
  }

  return [...newest.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
    .slice(0, limit)
    .map(([categoryId]) => categoryId)
}
