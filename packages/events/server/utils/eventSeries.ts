import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { TenantDb } from '../../../core/server/utils/tenantDb'
import { memberWritesAllowedFor } from '../../../core/shared/communitySuspension'
import { EVENTS_TABLE, type EventRecurrence, type EventRow } from '../../shared/types/event'

/**
 * Event-Serien (Plan EVENTS-V2 §7e): Master + MATERIALISIERTE Instanzen.
 * Rolling Window — Instanzen entstehen bis SERIES_WINDOW_DAYS voraus
 * (max. SERIES_MAX_PER_RUN je Lauf); das Top-up läuft on-read über die
 * öffentliche Liste (Muster publish-on-read), idempotent über den
 * Marker seriesGeneratedUntil am Master (Marker ZUERST).
 * Nach der Erzeugung ist jede Instanz eigenständig (einzeln editier-/
 * absagbar); Master-Edits propagieren bewusst nicht rückwirkend.
 */
export const SERIES_WINDOW_DAYS = 120
export const SERIES_MAX_PER_RUN = 26

/** Seitengröße der Serien-Fan-outs. */
const FAN_OUT_PAGE = 100
/**
 * Notbremse der Fan-outs. Eine wöchentliche Serie erzeugt in zehn Jahren gut
 * 500 Instanzen — 5000 ist also weit jenseits von allem Echten und trotzdem
 * eine Grenze, an der ein Datenfehler (Endlos-Cursor) auffällt statt den
 * Request zu fressen.
 */
const FAN_OUT_MAX = 5000

/**
 * ALLE Instanzen einer Serie — cursor-paginiert.
 *
 * WARUM (Audit-Befund vom 2026-08-02): die drei Fan-outs (Publish-Propagation,
 * Cover-Propagation, Serie beenden) liefen mit einem nackten
 * `Query.limit(200)`. Eine wöchentliche Serie überschreitet das nach knapp vier
 * Jahren, eine tägliche in gut einem halben — und dann KAPPT die Abfrage
 * still: „Serie beenden" hätte Termine stehen gelassen, ohne dass jemand es
 * erfährt. Ein Deckel, den niemand meldet, ist ein Datenfehler mit Ansage.
 */
export async function listSeriesInstances(
  db: TenantDb,
  seriesId: string,
  extra: string[] = [],
): Promise<EventRow[]> {
  const all: EventRow[] = []
  let cursor: string | null = null
  for (;;) {
    // Typ-Annotation ist Pflicht: ohne sie leitet TS den Rückgabetyp aus einer
    // Schleife her, die auf sich selbst zeigt (TS7022) — dasselbe Muster wie in
    // eventReminders.listAllScopedRsvps.
    const page: Models.RowList<EventRow> = await db.list<EventRow>(EVENTS_TABLE, [
      Query.equal('seriesId', seriesId),
      ...extra,
      Query.limit(FAN_OUT_PAGE),
      ...(cursor === null ? [] : [Query.cursorAfter(cursor)]),
    ])
    all.push(...page.rows)
    if (page.rows.length < FAN_OUT_PAGE) return all
    if (all.length >= FAN_OUT_MAX) {
      // LAUT, nicht still: lieber ein Log, das jemand findet, als eine
      // unvollständige Propagation, die wie Erfolg aussieht.
      console.error(`[events] Serien-Fan-out für ${seriesId} bei ${all.length} Instanzen abgebrochen (Notbremse) — Rest NICHT verarbeitet.`)
      return all
    }
    cursor = page.rows.at(-1)!.$id
  }
}

/** Nächster Termin nach der Regel; Monatsregel klemmt auf den Monatsletzten */
export function nextOccurrence(startIso: string, rule: EventRecurrence): string {
  const start = new Date(startIso)
  if (rule === 'weekly' || rule === 'biweekly') {
    return new Date(start.getTime() + (rule === 'weekly' ? 7 : 14) * 86_400_000).toISOString()
  }
  // monthly: gleicher Monatstag, bei kürzeren Monaten der letzte Tag
  const next = new Date(start)
  const day = start.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const daysInMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  next.setUTCDate(Math.min(day, daysInMonth))
  return next.toISOString()
}

/** Instanz-Daten aus dem Master kopieren (Zähler/Reminder frisch) */
function instanceData(master: EventRow, startAt: string, endAt: string | null, index: number) {
  return {
    title: master.title,
    description: master.description,
    startAt,
    endAt,
    location: master.location,
    url: master.url,
    capacity: master.capacity,
    attendeeCount: 0,
    status: master.status,
    organizerId: master.organizerId,
    organizerName: master.organizerName,
    coverFileId: master.coverFileId,
    locationType: master.locationType,
    replayUrl: null,
    address: master.address,
    locationNotes: master.locationNotes,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    remindersSentAt: null,
    access: master.access,
    priceAmount: master.priceAmount,
    priceLookupKey: master.priceLookupKey,
    recurrence: '',
    seriesId: master.$id,
    seriesIndex: index,
    seriesUntil: null,
    seriesGeneratedUntil: null,
  }
}

/**
 * Serie bis zum Fensterende expandieren. Startet hinter der JÜNGSTEN
 * vorhandenen Instanz (robust auch nach Teilläufen). Liefert die Anzahl
 * neu erzeugter Instanzen.
 *
 * WER HANDELT (F17): KEIN `actor` — ein Sweep. Zwar ruft die Anlege-Route ihn
 * einmal direkt (dort ist die Redaktion schon durch ihre eigene Prüfung
 * gegangen), der zweite und häufigere Aufrufer ist aber `topUpSeries` aus einem
 * beliebigen Listen-GET. Ein `actor: 'member'` machte damit jeden Vorbeisurfer
 * zum Mitglied (A5) und ließe eine Sperre eine laufende Serie mitten im Fenster
 * abreißen, ohne dass jemand die Handlung ausgelöst hätte.
 *
 * DIE QUOTA GILT AUCH HIER (Audit-Befund vom 2026-08-02). Gedeckelt war nur das
 * MANUELLE Anlegen (`index.post.ts`) — diese Schleife legt bis zu 26 Zeilen je
 * Lauf an, und sie läuft aus JEDEM Listen-GET. Ein Kunde materialisierte sich so
 * am Kontingent vorbei, ohne je etwas Verbotenes zu tun: er legt EINE Serie an,
 * die Zeilen entstehen danach von selbst.
 *
 * Geprüft wird VOR JEDEM Anlegen, nicht einmal vorab: nur so ist die Grenze
 * exakt, und die Kosten sind da, wo sie hingehören — ohne konfigurierte
 * events-Limits kehrt `assertPoolWriteQuota` sofort zurück (kein Query), mit
 * Limits sind es zwei indizierte Counts je Zeile bei einem Vorgang, der ein
 * paar Mal im Monat läuft.
 *
 * Erreicht die Quota ihr Ende, bricht die Schleife AB und meldet es — sie wirft
 * nicht. Ein Sweep darf den fremden Listen-Aufruf nicht sprengen, an dem er
 * zufällig hängt (fail-soft). Aber still weiterlaufen darf er auch nicht:
 * `logEvent` schreibt den Abbruch mit Mandant und Serie, sonst wäre eine
 * abgeschnittene Serie ununterscheidbar von einer, die einfach zu Ende ist.
 *
 * IN EINER GESPERRTEN COMMUNITY HÄLT DIESER SWEEP AN (F25, Entscheidung vom
 * 2026-08-02 — die Gegenseite zu publish-on-read in posts, das WEITERLÄUFT).
 *
 * Beide Sweeps laufen bewusst ohne `actor`, die Inhalts-Sperre der Datentür
 * greift also bei keinem von beiden — und das ist für die zwei Fälle NICHT
 * dieselbe Antwort:
 *  - `publishDuePosts` ändert nur die SICHTBARKEIT einer VORHANDENEN Zeile, die
 *    der Autor vor der Sperre eingestellt hat. Nichts entsteht, nichts kostet
 *    Kontingent — eine Sperre, die einen längst geschriebenen Beitrag
 *    zurückhält, nähme dem Autor eine Aussage, die er schon getroffen hat.
 *  - hier entstehen NEUE Zeilen, und sie kosten Kontingent. Genau das meint die
 *    Zahlungssperre: eine Community mit offener Rechnung soll nicht weiter
 *    Inhalt materialisieren. Ohne diese Zeile wächst die Serie über Monate
 *    weiter, ausgelöst von jedem beliebigen Lese-Request eines Fremden.
 *
 * Geprüft wird VOR dem Marker `seriesGeneratedUntil`: würde er trotz Sperre
 * geschrieben, hielte er das Fenster für erledigt und die Serie bekäme nach dem
 * Entsperren ein Loch, das nie wieder auffällt.
 *
 * FAIL-SOFT wie die Quota-Grenze: Rückgabe 0 statt Wurf — der Sweep hängt an
 * einem fremden Listen-Aufruf, der weiter funktionieren muss. Gemeldet wird es
 * trotzdem, sonst ist eine angehaltene Serie von einer beendeten nicht zu
 * unterscheiden.
 */
export async function expandSeries(event: H3Event, master: EventRow): Promise<number> {
  if (!master.recurrence || master.seriesId !== master.$id) return 0

  // Datentür als Operator: update/list belegen bzw. scopen die Zugehörigkeit,
  // create stempelt den Mandanten auf jede Instanz.
  const db = tenantDb(event, { as: 'operator' })

  if (!memberWritesAllowedFor(db.tenant)) {
    logEvent('warn', 'events.series_expansion_suspended', {
      seriesId: master.$id,
      communityId: db.tenant?.mode === 'pool' ? db.tenant.tenantId : '',
    })
    return 0
  }

  const windowEnd = Date.now() + SERIES_WINDOW_DAYS * 86_400_000
  const hardEnd = master.seriesUntil ? Date.parse(master.seriesUntil) : Infinity

  // Marker ZUERST (Idempotenz gegen parallele Top-ups)
  await db.update(EVENTS_TABLE, master.$id, {
    seriesGeneratedUntil: new Date(Math.min(windowEnd, hardEnd === Infinity ? windowEnd : hardEnd)).toISOString(),
  }, 'Event not found')

  // Jüngste Instanz der Serie als Ausgangspunkt
  const last = await db.find<EventRow>(EVENTS_TABLE, [
    Query.equal('seriesId', master.$id), Query.orderDesc('startAt'),
  ]) ?? master
  const durationMs = master.endAt ? Date.parse(master.endAt) - Date.parse(master.startAt) : null

  let created = 0
  let cursorStart = last.startAt
  let index = (last.seriesIndex ?? 0)
  while (created < SERIES_MAX_PER_RUN) {
    cursorStart = nextOccurrence(cursorStart, master.recurrence)
    const startMs = Date.parse(cursorStart)
    if (startMs > windowEnd || startMs > hardEnd) break
    // Kontingent VOR dem Anlegen — wirft 429, wenn die Grenze erreicht ist.
    // Hier wird daraus ein sauberer Abbruch mit Meldung (s. Kopf).
    const blocked = await assertPoolWriteQuota(event, { kind: 'events', tableId: EVENTS_TABLE })
      .then(() => null)
      .catch((error: unknown) => error)
    if (blocked) {
      // 429 = Kontingent erschöpft (der erwartete Fall). Alles andere ist ein
      // Fehler der PRÜFUNG selbst — auch dann wird nicht weitergeschrieben:
      // wer die Grenze nicht kennt, darf sie nicht überschreiten. Der
      // Unterschied steht im Log, damit man die beiden Fälle trennen kann.
      const status = (blocked as { status?: number }).status
      logEvent('warn', status === 429 ? 'events.series_expansion_quota_reached' : 'events.series_expansion_quota_check_failed', {
        seriesId: master.$id,
        created,
        // `tenantId` gibt es nur am Pool-Zweig der Union — im Silo ist die
        // Frage „welche Community?" gegenstandslos.
        communityId: db.tenant?.mode === 'pool' ? db.tenant.tenantId : '',
        ...(status === 429 ? {} : { error: String(blocked) }),
      })
      break
    }

    index++
    const endAt = durationMs !== null ? new Date(startMs + durationMs).toISOString() : null
    await db.create(EVENTS_TABLE, instanceData(master, cursorStart, endAt, index), {
      // Leserechte wie beim Master (published → Publikum der Community, C18;
      // draft → nur Verwaltung)
      permissions: master.status === 'published' ? withPublishedRead([], event) : [],
    }).catch((error) => {
      throw toH3Error(error, 'Could not expand event series')
    })
    created++
  }
  return created
}

/**
 * on-read-Top-up: Master, deren Fenster abgelaufen ist, nachziehen —
 * best-effort (Fehler loggen, Liste nie blockieren). Datentür als Operator:
 * jeder Listen-GET zieht die Serien SEINES Mandanten nach (Muster
 * publishDuePosts — im Pool bleibt nichts liegen, weil jede Community
 * ihre eigene Liste liest).
 */
export async function topUpSeries(event: H3Event): Promise<void> {
  try {
    const masters = await tenantDb(event, { as: 'operator' }).list<EventRow>(EVENTS_TABLE, [
      Query.notEqual('recurrence', ''), Query.limit(50),
    ])
    const threshold = Date.now() + (SERIES_WINDOW_DAYS - 14) * 86_400_000
    for (const master of masters.rows) {
      // `hidden` stoppt das Nachwachsen genauso wie `cancelled` (F15): ein
      // ausgeblendeter Serien-Master würde sonst weiter Instanzen erzeugen — und
      // die erben in `instanceData` seinen Status, d. h. die Moderation hätte
      // alle 14 Tage neue ausgeblendete Zeilen aufzuräumen, die niemand sieht
      // und niemand angelegt hat.
      if (!master.recurrence || master.seriesId !== master.$id) continue
      if (master.status === 'cancelled' || master.status === 'hidden') continue
      if (master.seriesUntil && Date.parse(master.seriesUntil) <= Date.now()) continue
      const generatedUntil = master.seriesGeneratedUntil ? Date.parse(master.seriesGeneratedUntil) : 0
      if (generatedUntil >= threshold) continue
      await expandSeries(event, master)
    }
  }
  catch (error) {
    logEvent('warn', 'events.series_topup_failed', { error: String(error) })
  }
}
