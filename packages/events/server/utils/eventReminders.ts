import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { TenantDb } from '../../../core/server/utils/tenantDb'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE, type EventRow, type EventRsvpRow } from '../../shared/types/event'

/** Vorlauf der Erinnerung (Entscheidung David, EVENTS-V2 §8.2: 24 h) */
const REMINDER_LEAD_MS = 24 * 3600_000

/**
 * Reminder-Sweep OHNE Cron (Muster publishDuePosts): published-Events, die
 * innerhalb der nächsten 24 h starten und noch nicht erinnert wurden, lösen
 * eine In-App-Notification an alle Zusager aus (Core-Vertrag notify()).
 *
 * Idempotenz: remindersSentAt wird ZUERST gesetzt (dann erst notify) und
 * der Sweep läuft in-memory serialisiert — parallele GETs derselben Instanz
 * erinnern nie doppelt (Cross-Instanz akzeptiert, Muster Rate-Limit/Locks).
 * Best-effort: ein Fehler hier darf den auslösenden GET nie scheitern lassen.
 * Trade-off dokumentiert (EVENTS-V2 §4): besucht niemand die Seite, feuert
 * nichts — Lückenschluss ist die scheduled Function auf
 * POST /api/events/reminder-sweep.
 */
let sweepInFlight: Promise<void> | null = null

export async function sweepEventReminders(event: H3Event): Promise<void> {
  if (sweepInFlight) return
  sweepInFlight = doSweep(event).catch(() => {}).finally(() => { sweepInFlight = null })
  await sweepInFlight
}

async function doSweep(event: H3Event): Promise<void> {
  // Datentür als Operator: jeder GET sweept die fälligen Events SEINES
  // Mandanten (Muster publishDuePosts) — list scopet, update belegt die
  // Zugehörigkeit. Die RSVP-Suche pro Event bleibt eventId-gebunden
  // (eventId ist bereits mandantenbelegt).
  const db = tenantDb(event, { as: 'operator' })
  const now = Date.now()

  const due = await db.list<EventRow>(EVENTS_TABLE, [
    Query.equal('status', 'published'),
    Query.greaterThan('startAt', new Date(now).toISOString()),
    Query.lessThanEqual('startAt', new Date(now + REMINDER_LEAD_MS).toISOString()),
    Query.isNull('remindersSentAt'),
    Query.limit(10),
  ])

  for (const row of due.rows) {
    // Flag ZUERST — schlägt notify danach fehl, lieber eine verpasste
    // Erinnerung als Duplikate bei jedem weiteren GET
    await db.update(EVENTS_TABLE, row.$id, { remindersSentAt: new Date(now).toISOString() })

    const rsvps = await listAllScopedRsvps(db, row.$id)
    for (const rsvp of rsvps) {
      // Typ 'reminder' rendert die Bell als „Erinnerung: {title} beginnt
      // bald"; body = Startzeit als Text (notify speichert bewusst fertigen
      // Text, keine i18n-Keys)
      await notify(event, {
        recipientId: rsvp.userId,
        type: 'reminder',
        title: row.title,
        body: new Intl.DateTimeFormat('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }).format(new Date(row.startAt)),
        link: `/events/${row.$id}`,
      })
    }
  }
}

/** Alle going-RSVPs eines Events — cursor-paginiert DURCH die Tür (Ersatz
 *  für listAllRows, das den rohen Client bräuchte). */
async function listAllScopedRsvps(db: TenantDb, eventId: string): Promise<EventRsvpRow[]> {
  const all: EventRsvpRow[] = []
  let cursor: string | null = null
  while (true) {
    const queries = [
      Query.equal('eventId', eventId),
      Query.equal('status', 'going'),
      Query.limit(100),
      ...(cursor === null ? [] : [Query.cursorAfter(cursor)]),
    ]
    const rows: EventRsvpRow[] = (await db.list<EventRsvpRow>(EVENT_RSVPS_TABLE, queries)).rows
    all.push(...rows)
    if (rows.length < 100) return all
    cursor = rows.at(-1)!.$id
  }
}
