import { canHideEvent } from '../../../../shared/eventModerationPolicy'
import { EVENTS_TABLE, type EventRow } from '../../../../shared/types/event'

/**
 * Moderation: Termin ausblenden (F15) — zweiphasig wie posts/comments: erst der
 * Status (damit das Realtime-Event die Leser noch erreicht), dann der Entzug des
 * Leserechts (sonst bleibt der Termin per Roh-REST gast-lesbar).
 *
 * DAS TITELBILD FOLGT MIT — und zwar von selbst. `coverAudience.ts` rechnet die
 * Datei-Rechte aus den READ-Einträgen der ROW aus, nie aus dem Status („ein Cover
 * ist nie offener als sein Termin"). Nach `withoutPublishedRead` bleibt dort
 * nichts übrig, also bekommt auch die Datei nichts. Es braucht deshalb KEINE
 * eigene `hidden`-Zeile in der Cover-Regel; sie wäre sogar schädlich, weil sie die
 * eine Wahrheit (die Permissions) durch eine zweite (den Status) ergänzt hätte.
 * Ein ausgeblendeter Termin mit weiter abrufbarem Titelbild wäre genau der halbe
 * Schutz, den events-009/010 abgeräumt haben.
 *
 * WER HANDELT (C1c): KEIN `actor` — Moderation. Der Default ist damit die
 * Türklinke `operator`, und das ist hier beides richtig: die M13-Inhalts-Sperre
 * lässt Moderation ausdrücklich durch (eine wegen Zahlungsverzug gesperrte
 * Community muss moderierbar bleiben, sonst wird sie zum Problem des Betreibers),
 * und ein A5-Beitritt wäre falsch — wer moderiert, handelt nicht in eigener Sache.
 *
 * PRODUKT-GATE (P4): bleibt drin, wie bei posts. Der Gate beantwortet „hat diese
 * Community das Produkt Termine überhaupt?" — lautet die Antwort nein, sind auch
 * die öffentlichen Routen (Liste, Detail, ICS, Cover) 404, es gibt also nichts
 * Erreichbares zu moderieren. Der Fall, in dem Inhalt sichtbar IST und trotzdem
 * moderierbar bleiben muss (M13), hängt an der Türklinke oben, nicht an diesem
 * Gate. Ohne den Gate wäre außerdem die Queue erreichbar, während ihr
 * Menüpunkt (`planProduct: 'events'`) verschwunden ist — Seite und Route würden
 * verschiedene Dinge sagen.
 *
 * AUTORISIERUNG: `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass. Das `await` ist Pflicht — ohne wäre der Gate fail-open.
 *
 * BEWUSST KEIN AUTO-HIDE: comments blendet ab `pukalani.comments.autoHideReports`
 * offenen Meldungen automatisch aus. Für Termine gibt es das NICHT und soll es im
 * ersten Schnitt nicht geben. Ein Termin ist ein Ereignis mit Zusagen, Kalender-
 * einträgen und womöglich gekauften Karten; ihn auf Zuruf von N Meldungen
 * verschwinden zu lassen, ist eine Brechstange, mit der sich eine abgestimmte
 * Gruppe jede unliebsame Veranstaltung abräumen kann. Hier entscheidet ein Mensch.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'events')
  const { user } = await requireCommunityPermission(event, 'events.moderate')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  // Datentür als Operator: get belegt die Zugehörigkeit (fremder Mandant → 404),
  // erst dann wird moderiert.
  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  const verdict = canHideEvent(row.status)
  if (!verdict.allowed) {
    throw createError({
      status: 409,
      statusText: 'Only published events can be hidden',
      data: { code: verdict.reason },
    })
  }

  const updated = await db.update<EventRow>(EVENTS_TABLE, id, { status: 'hidden' })
    .catch((error) => { throw toH3Error(error, 'Could not hide event') })

  const withdrawn = withoutPublishedRead(updated.$permissions, event)
  if (withdrawn.length !== updated.$permissions.length) {
    const withdraw = () => db.updatePermissions(EVENTS_TABLE, id, withdrawn)
    // Phase 2 muss halten — Retry für transiente Fehler, persistente laut loggen
    await withdraw()
      .catch(() => withdraw())
      .catch((error) => {
        console.error(`[events] Permission-Entzug fehlgeschlagen — hidden-Event ${id} bleibt Roh-REST-lesbar bis zum Re-Hide:`, error)
      })
  }
  // Das Titelbild an die (jetzt leeren) Row-Rechte angleichen — best-effort mit
  // lautem Log, wie an jeder anderen Publikums-Änderung auch.
  await applyEventCoverVisibility(event, { ...updated, $permissions: withdrawn })

  // Ausblenden schließt zugleich die offenen Meldungen (moderation-Vertrag) —
  // best-effort: das Ausblenden ist bereits passiert, ein Resolve-Fehler darf es
  // nicht als gescheitert melden.
  await resolveReportsForTarget(event, 'event', id, 'hidden', user.$id)
    .catch(error => console.error(`[events] Meldungen zu Event ${id} konnten nicht aufgelöst werden:`, error))

  // Feed-Einträge des Termins entfernen (core-Vertrag) — sonst bleibt sein
  // metadata-Snippet ('event.published', 'event.replay_published') im
  // Activity-Feed sichtbar, obwohl der Termin weg ist.
  await removeActivitiesForObject(event, { objectType: 'event', objectId: id })

  return { ok: true }
})
