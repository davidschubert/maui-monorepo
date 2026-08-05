import { Query } from 'node-appwrite'
import { POSTS_TABLE, POST_VOTES_TABLE } from '../../shared/types/post'

/**
 * Die posts-Seite des Zähl-Vertrags (F1 Stufe 4): vergebene Upvotes und eigene
 * Beiträge nach erhaltenen Upvotes.
 *
 * ── SIEBEN `count`-ABFRAGEN, UND KEINE ZEILE WANDERT ──────────────────────
 * Eine für die vergebenen Stimmen, je eine pro Schwelle. `count` überträgt
 * bewusst nichts: die Alternative wäre, alle eigenen Beiträge zu laden und im
 * Speicher zu zählen — bei jemandem mit 800 Beiträgen sind das 32 Seiten, und
 * die Zahl der Abfragen hinge dann daran, wie lange jemand dabei ist. So ist
 * sie konstant. Die passenden Indizes legt posts-012 an.
 *
 * ── ZWEIMAL DIESELBE ZAHL, ZWEI NAMEN ─────────────────────────────────────
 * Jede Schwelle wird EINMAL gezählt und unter ZWEI Zählern gemeldet:
 * `likedItems` (alle Inhaltsarten zusammen, dort summiert sich `comments`
 * dazu) und `likedTopics` (nur eigenständige Beiträge). Das kostet keine
 * zusätzliche Abfrage und erspart dem Katalog die Frage, welcher Layer welche
 * Inhaltsart führt.
 *
 * ── NUR VERÖFFENTLICHTES ZÄHLT ────────────────────────────────────────────
 * Ein geplanter, ausgeblendeter oder gelöschter Beitrag ist kein Verdienst.
 * Bei den Stimmen fehlt der Filter mit Absicht: eine abgegebene Stimme bleibt
 * abgegeben, auch wenn ihr Ziel später verschwindet.
 *
 * ── DIE ZUSÄTZLICHEN ABFRAGEN GIBT ES NUR AUF NACHFRAGE ───────────────────
 * `windows` kommt vom Konsumenten und ist fast immer leer (F1, Abzeichen
 * „Jahrestag"). Je Fenster kommt EINE weitere `count`-Abfrage dazu: „habe ich
 * in diesem Zeitraum etwas veröffentlicht?". Gefragt wird nur nach
 * Mitgliedsjahren, für die es noch kein Abzeichen gibt — im Regelfall also
 * nach keinem oder genau einem, und nach einem verliehenen Jahr nie wieder.
 * Der bestehende Index `idx_community_author_upvotes` trägt die
 * Gleichheitsfilter (Mandant, Autor), der Rest läuft auf den eigenen Beiträgen
 * EINES Menschen; eine neue Migration braucht es dafür nicht.
 *
 * `seed` verhält sich genauso und wird noch seltener gesetzt: EINMAL je Mensch,
 * wenn seine Zähler-Zeile geeicht wird (F1, mitschreibende Zähler).
 *
 * ── MITGLIEDER-KLINKE, und das ist die enge Wahl ──────────────────────────
 * Gezählt wird ausschließlich Eigenes; die Row-Permissions reichen dafür und
 * bilden zusätzlich zur Datentür ein zweites Netz. `as: 'operator'` wäre hier
 * eine Klinke ohne Grund. Geschrieben wird nichts, Sperre (M13) und Beitritt
 * (A5) hängen am Schreiben — ein Zählvorgang löst also nichts aus.
 */
export default defineNitroPlugin(() => {
  registerUserCounterProvider('posts', async (event, { thresholds, windows, seed }) => {
    const userId = event.context.user?.$id
    if (!userId) return {}

    const db = tenantDb(event)
    const asked = windows ?? []

    const [likesGiven, topicsCreated, ...rest] = await Promise.all([
      db.count(POST_VOTES_TABLE, [
        Query.equal('userId', userId),
        Query.equal('value', 1),
      ]),
      // Fester Platz in der Reihe, damit die Fenster und Schwellen dahinter
      // ihre Position behalten — ohne Nachfrage ein `null`, keine Abfrage.
      // Auf Nachfrage: der STARTWERT für den mitschreibenden Zähler (F1,
      // Lazy-Seed). Gezählt werden dieselben Zeilen, die auch `topicsCreated`
      // beim Schreiben hochzählt — veröffentlichte eigene Beiträge, mit und
      // ohne Kategorie.
      seed
        ? db.count(POSTS_TABLE, [
            Query.equal('authorId', userId),
            Query.equal('status', 'published'),
          ])
        : Promise.resolve<number | null>(null),
      // Je Fenster EINE Abfrage: „habe ich in diesem Zeitraum etwas
      // veröffentlicht?". Gefiltert wird über `publishedAt` und nicht über
      // `$createdAt` — ein lange vorbereiteter, gestern veröffentlichter
      // Beitrag zählt zu gestern. Das ENDE ist seit der Mehrfach-Verleihung
      // Pflicht des Fragenden: ein Mitgliedsjahr hört auf.
      ...asked.map(window => db.count(POSTS_TABLE, [
        Query.equal('authorId', userId),
        Query.equal('status', 'published'),
        Query.greaterThanEqual('publishedAt', window.since),
        ...(window.until ? [Query.lessThan('publishedAt', window.until)] : []),
      ])),
      ...thresholds.map(threshold => db.count(POSTS_TABLE, [
        Query.equal('authorId', userId),
        Query.equal('status', 'published'),
        Query.greaterThanEqual('upvotes', threshold),
      ])),
    ])

    const counters: Record<string, number> = { [COUNTER_LIKES_GIVEN]: likesGiven }
    if (topicsCreated !== null) counters[COUNTER_TOPICS_CREATED] = topicsCreated
    asked.forEach((window, index) => {
      counters[counterContentIn(window.key)] = rest[index] ?? 0
    })
    thresholds.forEach((threshold, index) => {
      const measured = rest[asked.length + index] ?? 0
      counters[counterLikedItems(threshold)] = measured
      counters[counterLikedTopics(threshold)] = measured
    })
    return counters
  })
})
