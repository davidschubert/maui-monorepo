import { Permission, Query, Role } from 'node-appwrite'
import { rsvpSchema } from '../../../../schemas/event'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE, type EventRow, type EventRsvpRow, type RsvpResponse, type RsvpStatus } from '../../../../shared/types/event'

/**
 * RSVP: setzen, wechseln oder (gleicher Status erneut) zurückziehen — Upsert
 * mit Toggle, server-autoritativ über die Datentür als Operator (event_rsvps
 * haben bewusst keine User-Schreibrechte; get/create belegen bzw. stempeln
 * den Mandanten). attendeeCount zählt NUR 'going' und wird ausschließlich
 * über atomare Increments geschrieben; der Kapazitäts-Check läuft VOR dem
 * Upsert und ist über increment(max: capacity) auch im Race überbuchungssicher.
 *
 * ZWEI TÜREN, NACH RICHTUNG GETRENNT (F26, Entscheidung vom 2026-08-02) — die
 * Route hatte bis dahin genau eine, und damit war in einer billing-gesperrten
 * Community auch das ZURÜCKZIEHEN zu.
 *
 * Die Toggle-Semantik versteckte das: „zusagen" und „Zusage zurücknehmen" sind
 * derselbe Aufruf mit demselben Body, sie unterscheiden sich nur am Bestand.
 * Fachlich sind es aber zwei verschiedene Dinge, und nur eines davon meint die
 * Sperre —
 *   - Zusagen/Wechseln ist eine NEUE Aussage in der Community: bleibt ZU
 *     (`db`, `actor: 'member'`).
 *   - Zurückziehen ist eine RÜCKNAHME der eigenen, früheren Aussage: bleibt
 *     OFFEN. Wer nicht absagen kann, blockiert einen Platz, den ein anderer
 *     bekommen könnte, und verfälscht die Planung des Organisators — für eine
 *     Rechnung, mit der er nichts zu tun hat. Dieselbe Logik wie beim Absagen
 *     eines Termins ([id].delete.ts), und sie steht dort ausdrücklich als der
 *     zweite (und einzige weitere) offene Weg.
 *
 * ENG GEZOGEN: offen ist NUR der Zweig, der die eigene Zeile LÖSCHT (und den
 * Zähler zurücknimmt). Ein Wechsel going → declined bleibt zu, obwohl er
 * ebenfalls einen Platz frei machen würde: er hinterlässt eine neue Aussage
 * („ich komme nicht") in der Community. Der Weg zum freien Platz steht trotzdem
 * offen — dieselbe Schaltfläche erneut, und die Zusage ist weg.
 *
 * Der WARTUNGSMODUS kennt diese Ausnahme NICHT (assertEventsWritable steht
 * unten vor allem anderen): den legt der Betreiber selbst um, er weiß von ihm
 * und kann ihn beenden — anders als der Zusagende, der von einer fremden
 * Rechnung nie erfährt.
 */
export default defineEventHandler(async (event): Promise<RsvpResponse> => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  // Wartungsmodus friert JEDEN Mitglieds-Schreibweg ein (utils/eventPolicy.ts).
  await assertEventsWritable(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const { status: target } = await readValidatedBody(event, rsvpSchema.parse)
  // `actor: 'member'` (Audit-Befund 2026-08-01): die Klinke ist Technik
  // (event_rsvps tragen bewusst keine User-Schreibrechte), zu- oder abgesagt hat
  // ein Mitglied. Die M13-Sperre nennt „Zu- und Absagen" ausdrücklich.
  const db = tenantDb(event, { as: 'operator', actor: 'member' })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (row.status !== 'published') {
    throw createError({ status: 409, statusText: 'Event is not open for RSVPs' })
  }

  const current = await db.find<EventRsvpRow>(EVENT_RSVPS_TABLE, [
    Query.equal('eventId', id), Query.equal('userId', user.$id),
  ])

  const increment = () => db.increment(EVENTS_TABLE, id, 'attendeeCount', {
    value: 1, ...(row.capacity !== null ? { max: row.capacity } : {}),
  })
  const decrement = () => db.decrement(EVENTS_TABLE, id, 'attendeeCount', { value: 1, min: 0 })

  let myRsvp: RsvpStatus | null

  if (current && current.status === target) {
    /**
     * Toggle: gleicher Status erneut = RSVP zurückziehen.
     *
     * EIGENE TÜR OHNE `actor` (F26, s. Kopf): technisch dieselbe Klinke, aber
     * ohne die fachliche Angabe „ein Mitglied schreibt Inhalt" — damit greift
     * die M13-Inhalts-Sperre auf DIESEM Zweig nicht, und nur auf ihm. Exakt die
     * Bauart, mit der `[id].delete.ts` das Absagen offenhält.
     *
     * Der A5-Beitritt entfällt damit ebenfalls, und das ist richtig: wer eine
     * Zusage zurücknimmt, hatte sie vorher — Mitglied ist er längst.
     *
     * Lazy angelegt, nicht oben: die zweite Tür baut einen zweiten
     * Admin-Client, und den braucht der weitaus häufigere Zusage-Weg nie.
     */
    const withdrawDb = tenantDb(event, { as: 'operator' })
    await withdrawDb.remove(EVENT_RSVPS_TABLE, current.$id)
    if (current.status === 'going') {
      // Der Zähler gehört zur Rücknahme — ginge er über `db`, stünde die Zusage
      // gelöscht da, während `attendeeCount` den Platz weiter belegt hielte.
      await withdrawDb.decrement(EVENTS_TABLE, id, 'attendeeCount', { value: 1, min: 0 })
    }
    myRsvp = null
  }
  else if (target === 'going') {
    // Paid-Gate (E4): Übergang ZU going braucht auf paid-Events ein Ticket —
    // ohne registrierten Guard fail-closed 403 (EVENTS-V2 §5)
    await assertCanRsvpGoing(event, row, user.$id)

    // Kapazitäts-Check VOR dem Upsert — der Vor-Check liefert das saubere
    // 409, das atomare increment(max) hält auch parallele Requests dicht.
    if (row.capacity !== null && row.attendeeCount >= row.capacity) {
      throw createError({ status: 409, statusText: 'Event is full' })
    }
    /**
     * „Voll" ist nur EINE der Antworten, die hier ankommen können — und bis
     * zum F26-Beweis (2026-08-02) hat dieser Zweig JEDE andere in sie
     * umgeschrieben. In einer billing-gesperrten Community wirft die Datentür
     * beim Hochzählen ihr 403 mit `reason: community_suspended`; der Kunde las
     * daraufhin „Event is full" — an einem leeren Termin ohne Kapazitäts-
     * grenze. Eine Falschauskunft, gegen die niemand etwas unternehmen kann.
     *
     * Deshalb: ein fertig geformter H3-Fehler (unsere `createError`s — Sperre,
     * Wartung, fehlende Rechte) reist unverändert weiter, samt seinem `reason`.
     * Nur die rohen Appwrite-Fehler werden übersetzt — der `max`-Anschlag des
     * atomaren Increments ist das einzige, was hier fachlich „voll" heißt.
     * `isError` ist dieselbe Unterscheidung, die auch `toH3Error` trifft.
     */
    await increment().catch((error: unknown) => {
      if (isError(error)) throw error
      throw createError({ status: 409, statusText: 'Event is full' })
    })

    try {
      if (current) {
        await db.update(EVENT_RSVPS_TABLE, current.$id, { status: target })
      }
      else {
        await db.create(EVENT_RSVPS_TABLE, {
          eventId: id, userId: user.$id, status: target,
        }, {
          // eigene RSVP lesbar (Debug/Export) — mehr nicht
          permissions: [Permission.read(Role.user(user.$id))],
        }).catch(async (error) => {
          // Unique-Index-Race (Doppelklick/zwei Tabs): der Gewinner steht —
          // dessen Row auf 'going' ziehen; war er schon 'going', ist unser
          // Increment doppelt und wird zurückgenommen.
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
            const winner = await db.find<EventRsvpRow>(EVENT_RSVPS_TABLE, [
              Query.equal('eventId', id), Query.equal('userId', user.$id),
            ])
            if (winner && winner.status !== 'going') {
              await db.update(EVENT_RSVPS_TABLE, winner.$id, { status: 'going' })
            }
            else {
              await decrement()
            }
            return
          }
          throw error
        })
      }
    }
    catch (error) {
      // Upsert gescheitert → Zähler-Gate zurückrollen, sonst driftet er
      await decrement().catch(() => {})
      throw toH3Error(error, 'Could not save RSVP')
    }

    myRsvp = 'going'
    // Community-Signal nur beim Zusagen (Core-Vertrag, best-effort)
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'event.rsvp',
      objectType: 'event',
      objectId: row.$id,
      link: `/events/${row.$id}`,
      metadata: { title: row.title },
    })
  }
  else {
    // maybe/declined: Upsert ohne Kapazitäts-Gate; verlässt der User
    // 'going', sinkt der Zähler
    if (current) {
      await db.update(EVENT_RSVPS_TABLE, current.$id, { status: target })
        .catch((error) => { throw toH3Error(error, 'Could not save RSVP') })
      if (current.status === 'going') await decrement()
    }
    else {
      await db.create(EVENT_RSVPS_TABLE, {
        eventId: id, userId: user.$id, status: target,
      }, {
        permissions: [Permission.read(Role.user(user.$id))],
      }).catch(async (error) => {
        // Unique-Race: Gewinner-Row auf den gewünschten Status ziehen;
        // verlässt sie dabei 'going', sinkt der Zähler
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
          const winner = await db.find<EventRsvpRow>(EVENT_RSVPS_TABLE, [
            Query.equal('eventId', id), Query.equal('userId', user.$id),
          ])
          if (winner && winner.status !== target) {
            await db.update(EVENT_RSVPS_TABLE, winner.$id, { status: target })
            if (winner.status === 'going') await decrement()
          }
          return
        }
        throw toH3Error(error, 'Could not save RSVP')
      })
    }
    myRsvp = target
  }

  // Frischen Zustand zurückgeben — die UI ersetzt Event + RSVP atomar
  const fresh = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  return { event: fresh, myRsvp }
})
