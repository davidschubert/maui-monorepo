import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
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
 */
export async function expandSeries(event: H3Event, master: EventRow): Promise<number> {
  if (!master.recurrence || master.seriesId !== master.$id) return 0

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const windowEnd = Date.now() + SERIES_WINDOW_DAYS * 86_400_000
  const hardEnd = master.seriesUntil ? Date.parse(master.seriesUntil) : Infinity

  // Marker ZUERST (Idempotenz gegen parallele Top-ups)
  await admin.tablesDB.updateRow({
    databaseId, tableId: EVENTS_TABLE, rowId: master.$id,
    data: { seriesGeneratedUntil: new Date(Math.min(windowEnd, hardEnd === Infinity ? windowEnd : hardEnd)).toISOString() },
  })

  // Jüngste Instanz der Serie als Ausgangspunkt
  const latest = await admin.tablesDB.listRows<EventRow>({
    databaseId, tableId: EVENTS_TABLE,
    queries: [Query.equal('seriesId', master.$id), Query.orderDesc('startAt'), Query.limit(1)],
  })
  const last = latest.rows[0] ?? master
  const durationMs = master.endAt ? Date.parse(master.endAt) - Date.parse(master.startAt) : null

  let created = 0
  let cursorStart = last.startAt
  let index = (last.seriesIndex ?? 0)
  while (created < SERIES_MAX_PER_RUN) {
    cursorStart = nextOccurrence(cursorStart, master.recurrence)
    const startMs = Date.parse(cursorStart)
    if (startMs > windowEnd || startMs > hardEnd) break
    index++
    const endAt = durationMs !== null ? new Date(startMs + durationMs).toISOString() : null
    await admin.tablesDB.createRow({
      databaseId, tableId: EVENTS_TABLE, rowId: ID.unique(),
      data: instanceData(master, cursorStart, endAt, index),
      // Leserechte wie beim Master (published → read any; draft → nur Verwaltung)
      permissions: master.status === 'published' ? [EVENT_READ_ANY] : [],
    }).catch((error) => {
      throw toH3Error(error, 'Could not expand event series')
    })
    created++
  }
  return created
}

/**
 * on-read-Top-up: Master, deren Fenster abgelaufen ist, nachziehen —
 * best-effort (Fehler loggen, Liste nie blockieren).
 */
export async function topUpSeries(event: H3Event): Promise<void> {
  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const masters = await admin.tablesDB.listRows<EventRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: EVENTS_TABLE,
      queries: [Query.notEqual('recurrence', ''), Query.limit(50)],
    })
    const threshold = Date.now() + (SERIES_WINDOW_DAYS - 14) * 86_400_000
    for (const master of masters.rows) {
      if (!master.recurrence || master.seriesId !== master.$id || master.status === 'cancelled') continue
      if (master.seriesUntil && Date.parse(master.seriesUntil) <= Date.now()) continue
      const generatedUntil = master.seriesGeneratedUntil ? Date.parse(master.seriesGeneratedUntil) : 0
      if (generatedUntil >= threshold) continue
      await expandSeries(event, master)
    }
  }
  catch (error) {
    console.warn('[events] Serien-Top-up fehlgeschlagen (best-effort):', error)
  }
}
