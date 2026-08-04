import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { POST_VIEWS_TABLE, type PostViewCounter } from '../../shared/types/post'
import { viewBufferKey, viewDedupeSubject } from '../../shared/topicViewKeys'

/**
 * AUFRUF-ZÄHLUNG JE TOPIC (F1 Stufe 2, Spalte „Aufrufe").
 *
 * ── Zwei Fallen, an denen der naheliegende Entwurf stirbt ───────────────────
 *
 * (a) **Ein Zähler AUF der Beitrags-Zeile** bewegt `$updatedAt` und
 *     veröffentlicht ein Realtime-Ereignis — bei JEDEM Aufruf, auch dem eines
 *     Gastes. Damit wäre die Aktivitäts-Spalte, die Stufe 2 gerade erst ehrlich
 *     gemacht hat, sofort wieder kaputt (jedes Anschauen sähe aus wie eine
 *     Wortmeldung), und jeder Feed-Abonnent bekäme Ereignisse geschickt, hinter
 *     denen nichts steckt. Deshalb eine EIGENE Tabelle, deren Zeilen KEINE
 *     Row-Permissions tragen: ohne Leser gibt es auch kein Realtime.
 *
 * (b) **Ein Schreibvorgang je Seitenaufruf** ist auf einem geteilten Pool
 *     Schreiblast, die Unangemeldete erzeugen — und zwar unbegrenzt. Deshalb
 *     wird nicht je Aufruf geschrieben, sondern GEPUFFERT: im Speicher hochzählen,
 *     höchstens alle 60 s (oder wenn der Puffer voll ist) in einem Rutsch
 *     wegschreiben.
 *
 * ── Der gewählte Entwurf, und was er kostet ────────────────────────────────
 * BEIDES, nicht das eine ODER das andere: die eigene Tabelle löst (a), der
 * Puffer löst (b). Nur die Tabelle hieße weiterhin ein Write je Aufruf; nur der
 * Puffer hieße weiterhin Realtime-Rauschen auf der Beitrags-Zeile.
 *
 * Der Preis ist eine bewusste UNSCHÄRFE, und sie gehört ausgesprochen:
 *  - Die Zahl hinkt bis zu 60 s hinterher.
 *  - Stirbt der Prozess mit gefülltem Puffer (Deploy, Neustart), sind die
 *    ungeschriebenen Aufrufe WEG. Ein Aufruf-Zähler ist eine Größenordnung,
 *    keine Buchführung — für Genauigkeit auf den einzelnen Klick müsste man
 *    genau die Schreiblast bezahlen, die (b) beschreibt.
 *  - Der Puffer lebt PRO PROZESS. Mehrere pm2-Instanzen puffern getrennt und
 *    schreiben getrennt; weil sie über `incrementRowColumn` (atomar) gehen,
 *    addiert sich das korrekt statt sich zu überschreiben.
 *
 * VERWORFEN: eine Zähl-Tabelle mit EINER ZEILE JE AUFRUF (Discourse macht das,
 * um „wer hat gelesen" zeigen zu können). Das ist keine Zahl mehr, sondern ein
 * Lese-Protokoll je Person — im Pool eine personenbezogene Datensammlung, für
 * die es hier weder eine Lese-Stelle noch einen Zweck gäbe. F18 hat genau so
 * eine Sammlung gerade abgebaut; wir bauen sie nicht neu auf. Was hier
 * gespeichert wird, ist ein AGGREGAT (Zahl je Topic) — über Personen steht
 * nichts in der Datenbank.
 */

/** Wie lange gepuffert wird, bevor geschrieben wird. */
const FLUSH_INTERVAL_MS = 60_000

/**
 * Notbremse: so viele verschiedene Topics dürfen höchstens ungeschrieben im
 * Puffer stehen, bevor unabhängig von der Uhr geschrieben wird. Schützt den
 * Speicher bei einem Ansturm und begrenzt zugleich, wie viel ein Neustart
 * höchstens verschluckt.
 */
const MAX_BUFFERED_TOPICS = 500

/**
 * Wie lange ein und derselbe Betrachter ein Topic nicht erneut zählt.
 *
 * DAS IST DIE MISSBRAUCHS-DÄMPFUNG. Ohne sie treibt eine gedrückte F5-Taste die
 * Zahl beliebig hoch — der billigste Weg, eine öffentliche Kennzahl zur Lüge zu
 * machen. 30 Minuten sind lang genug, dass eine Reload-Schleife praktisch
 * nichts bringt (2 Aufrufe/Stunde), und kurz genug, dass ein Mensch, der
 * abends noch einmal vorbeischaut, wieder zählt.
 *
 * EHRLICHE GRENZE, und sie ist keine kleine: unterschieden wird nach Konto ODER
 * IP. Wer wechselnde IPs hat (Botnetz, Mobilfunk, VPN-Hopping), umgeht das —
 * dagegen hilft nur eine Zählung, die diesen Namen nicht mehr verdient. In der
 * anderen Richtung zählt ein ganzes Büro hinter EINER IP nur einmal. Beides ist
 * für ein Aggregat hinnehmbar; wäre die Zahl je eine Abrechnungsgröße, wäre
 * dieser Entwurf zu schwach.
 *
 * WAS NICHT PASSIERT: die IP wird nirgends GESPEICHERT. Sie steht nur als Teil
 * eines Schlüssels im Rate-Limit-Store (Redis, mit Verfallszeit) — dasselbe
 * Verfahren und derselbe Speicher, den die Drosselung ohnehin benutzt. In
 * `post_views` landet ausschließlich eine Zahl.
 */
const DEDUPE_WINDOW_MS = 30 * 60_000

/** Puffer und Uhr, pro Prozess. Schlüssel = Mandanten-Scope + Beitrags-Id. */
const buffer = new Map<string, number>()
const lastFlushAt = new Map<string, number>()

/** Nur für Tests/Diagnose: Puffer leeren. */
export function __resetTopicViewBuffer(): void {
  buffer.clear()
  lastFlushAt.clear()
}

/**
 * Hat dieser Betrachter das Topic gerade schon angesehen?
 *
 * Läuft über den GETEILTEN Rate-Limit-Store: mit Redis gilt das Fenster für
 * alle Instanzen gemeinsam, ohne Redis pro Instanz (der Store fällt selbst
 * darauf zurück). Fehler ⇒ „nein, noch nicht gesehen": eine Störung soll
 * Aufrufe nicht verschlucken, und sie öffnet hier nichts Gefährliches —
 * schlimmstenfalls zählt ein Reload einmal mehr.
 */
async function seenRecently(event: H3Event, postId: string): Promise<boolean> {
  const subject = viewDedupeSubject(event.context.user?.$id, trustedClientIp(event))
  // Weder Konto noch IP: nichts, woran man einen Betrachter erkennen könnte.
  // Dann wird NICHT gezählt — eine Quelle ohne Wiedererkennung ist genau die,
  // die eine Schleife fahren würde.
  if (!subject) return true

  try {
    const { store, prefix } = useRateLimitStore(event)
    const { count } = await store.hit(`${prefix}view:${postId}:${subject}`, DEDUPE_WINDOW_MS)
    return count > 1
  }
  catch {
    return false
  }
}

/**
 * EINEN Aufruf verbuchen. Wirft nie — eine Topic-Seite darf nicht daran
 * scheitern, dass ein Zähler klemmt.
 *
 * Aufgerufen aus einem GET. Das ist hier kein Sündenfall, sondern das etablierte
 * Muster dieses Layers: `publishDuePosts` schreibt seit jeher im Feed-GET
 * (Publish-on-read). Der Unterschied ist nur, dass hier fast immer NICHTS
 * geschrieben wird — im Regelfall wird eine Zahl im Speicher erhöht.
 */
export async function recordTopicView(event: H3Event, postId: string): Promise<void> {
  try {
    if (await seenRecently(event, postId)) return

    const scope = tenantCacheScope(event)
    const key = viewBufferKey(scope, postId)
    buffer.set(key, (buffer.get(key) ?? 0) + 1)

    const now = Date.now()
    const due = now - (lastFlushAt.get(scope) ?? 0) >= FLUSH_INTERVAL_MS
    if (due || buffer.size >= MAX_BUFFERED_TOPICS) {
      lastFlushAt.set(scope, now)
      await flushScope(event, scope)
    }
  }
  catch (error) {
    logEvent('warn', 'posts.view_record_failed', {
      postId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Den Puffer DIESES Mandanten wegschreiben.
 *
 * NUR dieser Mandant, und das ist keine Optimierung: die Datentür schreibt in
 * die Community DES REQUESTS. Fremde Einträge stehen bleiben zu lassen ist die
 * einzige Möglichkeit, sie nicht in die falsche Community zu buchen — sie warten
 * auf einen eigenen Request. Ein Mandant ohne weiteren Verkehr verliert seine
 * paar gepufferten Aufrufe beim nächsten Neustart; das ist der Preis und er
 * steht oben.
 *
 * KLINKE UND HANDELNDER (F17/C1c): `as: 'operator'`, weil `post_views` bewusst
 * keine Client-Rechte trägt — mit der Mitglieder-Klinke käme kein Schreibvorgang
 * durch. `actor: 'operator'`, weil hier NIEMAND handelt: ausgelöst hat das
 * Anschauen einer Seite, oft durch einen Gast. Mit `'member'` hätte das zwei
 * Fehler auf einmal — es machte einen zufälligen Leser zum MITGLIED (A5, und
 * genau das verbietet der Auftrag ausdrücklich), und die Zahlungssperre (M13)
 * hielte in einer säumigen Community sogar die Aufruf-Zählung an. Eine gesperrte
 * Community ist LESBAR; ihre Leser zu zählen ist kein Inhalt.
 */
async function flushScope(event: H3Event, scope: string): Promise<void> {
  const prefix = viewBufferKey(scope, '')
  const mine: Array<[string, number]> = []
  for (const [key, value] of buffer) {
    if (key.startsWith(prefix)) mine.push([key.slice(prefix.length), value])
  }
  if (mine.length === 0) return

  // ZUERST aus dem Puffer nehmen, DANN schreiben: sonst zählt ein zweiter,
  // gleichzeitiger Request dieselben Aufrufe ein zweites Mal weg. Schlägt das
  // Schreiben fehl, sind sie verloren — bewusst, statt sie zurückzulegen und
  // bei einer längeren Störung den Puffer unbegrenzt wachsen zu lassen.
  for (const [postId] of mine) buffer.delete(viewBufferKey(scope, postId))

  const db = tenantDb(event, { as: 'operator', actor: 'operator' })
  for (const [postId, delta] of mine) {
    // Die Zeile trägt `rowId = postId`. Deshalb genügt „hochzählen, sonst
    // anlegen" ohne vorher nachzusehen — und ein Wettlauf zweier Instanzen
    // endet in einem 409, nicht in zwei Zeilen.
    const bumped = await db
      .increment<PostViewCounter>(POST_VIEWS_TABLE, postId, 'count', { value: delta }, 'View counter not found')
      .then(() => true)
      .catch(() => false)
    if (bumped) continue

    await db.create<PostViewCounter>(POST_VIEWS_TABLE, { postId, count: delta }, {
      rowId: postId,
      // KEINE Row-Permissions: gelesen wird ausschließlich server-seitig über
      // die Operator-Klinke. Damit hat die Zeile keinen Client-Leser — und
      // ohne Leser gibt es kein Realtime-Ereignis, was der halbe Grund für die
      // eigene Tabelle ist.
      permissions: [],
    }).catch(async () => {
      // 409 aus einem Wettlauf: die Zeile existiert jetzt, also nachzählen.
      await db
        .increment<PostViewCounter>(POST_VIEWS_TABLE, postId, 'count', { value: delta }, 'View counter not found')
        .catch(() => null)
    })
  }
}

/**
 * Aufruf-Zahlen für eine Seite Topics — EINE Abfrage, kein N+1.
 *
 * OPERATOR-KLINKE, und zwar hier ausnahmsweise beim LESEN: die Zähler-Zeilen
 * tragen absichtlich keine Read-Permission, ein Session-Client sähe also nichts.
 * Sicher ist das, weil die Datentür trotzdem nach `communityId` filtert UND die
 * Id-Liste aus Zeilen stammt, die der Aufrufer bereits durch die
 * Mitglieder-Klinke gesehen hat.
 *
 * Fehlt ein Zähler, ist die Antwort 0 — ein Topic, das noch niemand geöffnet
 * hat, hat null Aufrufe. Fehler ⇒ leere Karte ⇒ überall 0: eine Topic-Liste
 * darf an einer Nebenzahl nicht scheitern.
 */
export async function topicViewsFor(event: H3Event, postIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(postIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { rows } = await tenantDb(event, { as: 'operator' })
    .list<PostViewCounter>(POST_VIEWS_TABLE, [
      Query.equal('postId', ids),
      Query.limit(ids.length),
    ])
    .catch(() => ({ rows: [] as PostViewCounter[] }))

  return new Map(rows.map(row => [row.postId, row.count]))
}
