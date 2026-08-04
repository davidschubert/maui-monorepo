import { Query } from 'node-appwrite'
import { COMMENTS_TABLE, type Comment } from '../../shared/types/comment'

/**
 * „WO HABE ICH ZULETZT KOMMENTIERT?" — die comments-Seite des Core-Vertrags
 * `registerUserActivityProvider` (F1 Stufe 3, Stück 4).
 *
 * Der Konsument von heute ist die Seitenleiste der Discussions („meine letzten
 * fünf Kategorien"). Dieser Layer weiß davon nichts und soll es nicht wissen
 * (A14): er meldet Ziel-Typ, Ziel-Id und Zeitpunkt — was eine Kategorie ist,
 * geht ihn nichts an. Genau deshalb ist die Antwort NICHT auf `targetType:
 * 'post'` gefiltert: wer fragt, entscheidet, was ihn interessiert.
 *
 * ── DIE KLINKE: `member` (bewusst NICHT operator) ──────────────────────────
 * Hier liest jemand SEINE EIGENEN Kommentare. Der Session-Client kann das, und
 * er soll es auch: die Row-Permissions sind damit die erste Grenze, die
 * Datentür die zweite. Mit der Operator-Klinke stünden in der Antwort auch
 * ausgeblendete Kommentare — die Seitenleiste führte einen Menschen dann zu
 * einer Kategorie, in der von ihm nichts mehr steht.
 *
 * ── DIE MANDANTEN-GRENZE ───────────────────────────────────────────────────
 * `tenantDb` hängt den communityId-Filter an. Ohne ihn zeigte die Seitenleiste
 * in Community A Kategorien, die man in Community B berührt hat — im Pool wäre
 * das ein Leck über die Mandantengrenze, und zwar eines, das wie eine
 * Bequemlichkeit aussieht.
 *
 * ── WARUM MEHR ZEILEN GELESEN WERDEN, ALS GEFRAGT SIND ─────────────────────
 * `limit` meint ZIELE, die Abfrage liefert aber KOMMENTARE — und zehn davon
 * können an einem einzigen Beitrag hängen. Mit `limit` als Zeilenzahl käme bei
 * einem gesprächigen Menschen genau ein Ziel zurück. Der Aufschlag deckt das
 * ab; das Entdoppeln macht danach der Vertrag (`mergeUserActivity`), nicht
 * dieser Layer — sonst rechnete es jede Quelle für sich, und jede ein bisschen
 * anders.
 *
 * Wirft nicht nach oben: der Vertrag fängt ab und überspringt eine kaputte
 * Quelle. Der `.catch` steht trotzdem hier, damit ein Lesefehler eine leere
 * Antwort ergibt statt eines Log-Eintrags über einen „kaputten Provider" — für
 * einen Gast ohne Sitzung ist das der Normalfall, kein Vorfall.
 */

/** Wie viele Kommentar-ZEILEN je angefragtem Ziel gelesen werden. */
const ROWS_PER_TARGET = 6
/** Harte Obergrenze — eine Seitenleiste rechtfertigt keine große Abfrage. */
const MAX_ROWS = 100

export default defineNitroPlugin(() => {
  registerUserActivityProvider('comments', async (event, query) => {
    const { rows } = await tenantDb(event).list<Comment>(COMMENTS_TABLE, [
      Query.equal('authorId', query.userId),
      // Tombstones und ausgeblendete Kommentare sind keine Aktivität mehr:
      // sie würden zu einer Kategorie führen, in der nichts von einem steht.
      Query.equal('status', 'active'),
      Query.orderDesc('$createdAt'),
      Query.limit(Math.min(query.limit * ROWS_PER_TARGET, MAX_ROWS)),
    ]).catch(() => ({ rows: [] as Comment[] }))

    return rows.map(row => ({
      targetType: row.targetType,
      targetId: row.targetId,
      at: row.$createdAt,
    }))
  })
})
