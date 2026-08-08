/**
 * DER REITER „SPEICHER" IN REINER FORM (F51 Paket 2, 2026-08-07).
 *
 * Die Route `/api/community/usage` macht I/O (zählen), diese Datei macht die
 * ENTSCHEIDUNG: welcher Posten kommt überhaupt in die Antwort, und in welcher
 * Reihenfolge. Getrennt, damit die Regel testbar ist, ohne eine Appwrite-Instanz
 * zu brauchen — dasselbe Muster wie `evaluateQuota`/`limitsForPlan` in
 * core/server/utils/tenantQuota.ts.
 */

/** Ein Posten in der Antwort: Bestand und Kontingent, beide als reine Zahlen. */
export interface CommunityUsagePost {
  /** Quota-Posten (`comments`, `events`, `media`, …) — Schlüssel für den Text. */
  kind: string
  /** Bestand dieser Community. */
  total: number
  /** Kontingent des Tarifs. IMMER > 0 — unbegrenzte Posten stehen gar nicht drin. */
  limit: number
}

export interface CommunityUsageResponse {
  /** Tarif, aus dem die Kontingente stammen ('' = unbekannt/kein Pool-Mandant). */
  plan: string
  posts: CommunityUsagePost[]
}

/**
 * Welche Posten zeigt die Seite?
 *
 * DREI ENTSCHEIDUNGEN, jede mit einem Grund:
 *
 * 1. **Nur Posten mit einem `total`-Kontingent.** „12 von unbegrenzt" ist keine
 *    Auskunft, sondern Zeilenrauschen — und für die meisten Layer (posts,
 *    courses) nennt der Katalog heute gar keine Zahlen. Was kein Dach hat,
 *    braucht keinen Balken.
 *
 * 2. **`perDay` wird IGNORIERT.** Das Tageslimit ist eine ROLLIERENDE
 *    24-Stunden-Zählung; es anzuzeigen hieße, je Posten eine zweite Abfrage mit
 *    `$createdAt`-Filter zu fahren, und die Zahl wäre eine Minute später eine
 *    andere. Ein Fortschrittsbalken, der ohne Zutun zurückläuft, verwirrt mehr,
 *    als er erklärt. Wer heute zu schnell war, erfährt es an der Bremse
 *    (429 `quota_reached_today`) — dort, wo es ihn betrifft.
 *
 * 3. **Ein Posten ohne Zählung fällt raus** (`total === null`): das ist der
 *    fail-soft-Fall, wenn ein Produkt in dieser App gar nicht montiert ist oder
 *    seine Tabelle nicht antwortet. Lieber kein Eintrag als eine glatte 0, die
 *    „du hast noch nichts angelegt" behauptet, wo „ich weiß es nicht" richtig
 *    wäre.
 *
 * Sortiert wird nach `kind`, damit die Reihenfolge nicht an der zufälligen
 * Registrierungs-Reihenfolge der Nitro-Plugins hängt.
 */
export function selectUsagePosts(
  counts: readonly { kind: string, total: number | null }[],
  limitFor: (kind: string) => { total?: number } | undefined,
): CommunityUsagePost[] {
  const posts: CommunityUsagePost[] = []
  for (const count of counts) {
    if (count.total === null) continue
    const limit = limitFor(count.kind)?.total
    if (!limit || limit <= 0) continue
    posts.push({ kind: count.kind, total: count.total, limit })
  }
  return posts.sort((a, b) => a.kind.localeCompare(b.kind))
}

/**
 * Anteil eines Postens als Prozentzahl 0–100, ganzzahlig.
 *
 * GEDECKELT: der Bestand kann das Kontingent ÜBERSTEIGEN — ein gesenktes Limit
 * (Herabstufung, geänderter Katalog) macht aus 400 von 300 keinen Fehler,
 * sondern einen vollen Balken. Ein Fortschrittsbalken über 100 % sieht dagegen
 * nach einem Anzeigefehler aus.
 */
export function usagePercent(post: CommunityUsagePost): number {
  if (post.limit <= 0) return 0
  return Math.min(100, Math.round((post.total / post.limit) * 100))
}
