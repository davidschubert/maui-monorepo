import { Query } from 'node-appwrite'
import { eventEditSchema } from '../../../schemas/event'
import { eventIsEditable } from '../../../shared/eventModerationPolicy'
import { EVENTS_TABLE, isSeriesMaster, type EventRow } from '../../../shared/types/event'

/**
 * Event bearbeiten / publishen (events.manage). Status-Übergänge hier:
 * draft→published (setzt read(any), meldet den Feed-Eintrag) und
 * published→draft (entzieht read(any)). Absagen läuft über DELETE.
 * Abgesagte Events sind nicht mehr editierbar. Datentür als Operator:
 * get/update belegen die Zugehörigkeit — ein fremder Mandant bekommt 404.
 * Die Tür trennt Daten- und Permission-Writes bewusst (Muster posts
 * publishDuePosts): erst update, dann updatePermissions.
 *
 * AUTORISIERUNG (N5): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 *
 * WER HANDELT (F17): Redaktion an INHALT — `actor` aus dem Gate (Rolle ⇒
 * 'member' mit Inhalts-Sperre M13; Break-Glass ⇒ 'operator'). Veröffentlichen
 * zählt mit: das ist der Moment, in dem der Termin in die Welt geht.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const { user, actor } = await requireCommunityPermission(event, 'events.manage')

  // Wartungsmodus friert JEDEN Mitglieds-Schreibweg ein (utils/eventPolicy.ts).
  await assertEventsWritable(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const body = await readValidatedBody(event, eventEditSchema.parse)
  const db = tenantDb(event, { as: 'operator', actor })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  /**
   * Abgesagt UND ausgeblendet sind für die Redaktion zu (F15) — die Regel steht
   * pur in `eventModerationPolicy.ts`, damit das Aktions-Menü dieselbe Antwort
   * gibt wie diese Route.
   *
   * `hidden` ist hier neu und der eigentliche Grund für die Auslagerung:
   * `events.manage` (Editor) und `events.moderate` (Moderator) sind Geschwister-
   * Capabilities. Ohne diese Zeile könnte ein Editor einen von der Moderation
   * ausgeblendeten Termin im Bearbeiten-Dialog wieder auf „Veröffentlicht"
   * stellen und damit ein Urteil aufheben, dessen Capability er nie besitzt.
   * Zurück in die Welt kommt ein ausgeblendeter Termin ausschließlich über
   * `POST /api/events/:id/restore`.
   */
  if (!eventIsEditable(row.status)) {
    throw createError({
      status: 409,
      statusText: 'Cancelled or hidden events cannot be edited',
      data: { code: row.status === 'hidden' ? 'event_hidden' : 'event_cancelled' },
    })
  }

  // Zeitfenster gegen den ZUSAMMENGEFÜHRTEN Zustand prüfen (PATCH kann nur
  // eines der beiden Felder tragen — das Schema sieht dann nichts Falsches)
  const mergedStart = body.startAt ?? row.startAt
  const mergedEnd = body.endAt === undefined ? row.endAt : body.endAt
  if (mergedEnd && Date.parse(mergedEnd) <= Date.parse(mergedStart)) {
    throw createError({ status: 422, statusText: 'endAt must be after startAt' })
  }

  // paid braucht die Stripe-Preis-Referenz — gegen den MERGED Zustand
  const mergedAccess = body.access === undefined ? row.access : body.access
  const mergedLookupKey = body.priceLookupKey === undefined ? row.priceLookupKey : body.priceLookupKey
  if (mergedAccess === 'paid' && !mergedLookupKey) {
    throw createError({ status: 422, statusText: 'Paid events need a price lookup key' })
  }

  const publishing = body.status === 'published' && row.status === 'draft'
  const unpublishing = body.status === 'draft' && row.status === 'published'

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.startAt !== undefined) data.startAt = body.startAt
  if (body.endAt !== undefined) data.endAt = body.endAt
  if (body.location !== undefined) data.location = body.location
  if (body.url !== undefined) data.url = body.url
  if (body.capacity !== undefined) data.capacity = body.capacity
  if (body.locationType !== undefined) data.locationType = body.locationType
  if (body.replayUrl !== undefined) data.replayUrl = body.replayUrl
  if (body.address !== undefined) data.address = body.address
  if (body.locationNotes !== undefined) data.locationNotes = body.locationNotes
  if (body.status !== undefined) data.status = body.status

  // Replay-Announce nur beim ERSTEN Setzen auf einem sichtbaren Event
  const replayPublishing = typeof body.replayUrl === 'string' && body.replayUrl.length > 0
    && !row.replayUrl && (row.status === 'published' || publishing)

  const updated = await db.update<EventRow>(EVENTS_TABLE, id, data, 'Event not found').catch((error) => {
    throw toH3Error(error, 'Could not update event')
  })
  // Leserecht folgt dem Status: published = das Publikum der Community
  // (C18: alle bzw. alle Mitglieder), draft = niemand. DAS TITELBILD FOLGT MIT
  // (Audit-Befund 2026-08-02): seit events-009 hängt das Leserecht der Datei an
  // der Datei — ein zurückgezogener Termin, dessen Bild weiter per Roh-URL
  // abrufbar ist, wäre derselbe halbe Schutz wie vorher.
  if (publishing || unpublishing) {
    const permissions = publishing
      ? withPublishedRead(row.$permissions, event)
      : withoutPublishedRead(row.$permissions, event)
    await db.updatePermissions(EVENTS_TABLE, id, permissions)
      .catch((error) => { throw toH3Error(error, 'Could not update event') })
    await applyEventCoverVisibility(event, { ...updated, $permissions: permissions })
  }

  // Serie (§7e): Publish/Unpublish des MASTERS zieht seine Instanzen mit
  // (Lifecycle-Ausnahme von „Instanzen sind eigenständig" — vor dem Launch
  // will man die ganze Serie schalten); abgesagte Instanzen bleiben abgesagt.
  // Cursor-paginiert statt limit(200): eine lange Serie wurde sonst still
  // gekappt (Audit-Befund 2026-08-02).
  if ((publishing || unpublishing) && isSeriesMaster(updated)) {
    const instances = await listSeriesInstances(db, updated.$id, [Query.notEqual('$id', updated.$id)])
      .catch(() => [] as EventRow[])
    for (const instance of instances) {
      if (instance.status === 'cancelled') continue
      const permissions = publishing
        ? withPublishedRead(instance.$permissions, event)
        : withoutPublishedRead(instance.$permissions, event)
      await db.update(EVENTS_TABLE, instance.$id, { status: publishing ? 'published' : 'draft' })
        .then(() => db.updatePermissions(EVENTS_TABLE, instance.$id, permissions))
        .then(() => applyEventCoverVisibility(event, { ...instance, $permissions: permissions }))
        .catch(error => console.warn('[events] Serien-Publish-Propagation fehlgeschlagen:', error))
    }
  }

  if (publishing) {
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'event.published',
      objectType: 'event',
      objectId: updated.$id,
      link: `/events/${updated.$id}`,
      metadata: { title: updated.title },
    })
  }

  if (replayPublishing) {
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'event.replay_published',
      objectType: 'event',
      objectId: updated.$id,
      link: `/events/${updated.$id}`,
      metadata: { title: updated.title },
    })
  }

  return updated
})
