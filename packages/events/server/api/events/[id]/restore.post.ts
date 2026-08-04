import { canRestoreEvent } from '../../../../shared/eventModerationPolicy'
import { EVENTS_TABLE, type EventRow } from '../../../../shared/types/event'

/**
 * Moderation: ausgeblendeten Termin wiederherstellen (F15) — Leserecht und
 * Status zurück, Titelbild folgt.
 *
 * REIHENFOLGE UMGEKEHRT ZUM AUSBLENDEN, und das ist Absicht (Muster
 * posts/restore.post.ts): erst das Leserecht, dann der Status. So ist die Row
 * bereits wieder lesbar, wenn das Status-Realtime-Event bei den offenen Fenstern
 * ankommt — andersherum bekämen sie ein „published", das sie noch nicht lesen
 * dürfen, und zeigten eine Lücke.
 *
 * WIEDERHERGESTELLT WIRD IMMER NACH `published`, nie nach `draft`: ausgeblendet
 * werden kann laut `canHideEvent` nur ein veröffentlichter Termin, also ist
 * `published` der Zustand, aus dem er kam. Deshalb darf `hidden` auch nicht auf
 * Entwürfe angewandt werden — sonst wäre dieses Zurückschreiben eine
 * Veröffentlichung, die nie jemand angeordnet hat.
 *
 * WER HANDELT (C1c): KEIN `actor` — Moderation, dieselbe Begründung wie beim
 * Ausblenden (hide.post.ts): die M13-Sperre lässt sie durch, ein A5-Beitritt wäre
 * falsch. Produkt-Gate und Autorisierung ebenfalls wie dort.
 *
 * DIE MELDUNGEN BLEIBEN GESCHLOSSEN. `hide` hat sie mit `resolution: 'hidden'`
 * abgeschlossen; ein Wiederherstellen macht daraus keine offenen Meldungen
 * zurück. Die Entscheidung „doch in Ordnung" ist der ABSCHLUSS des Vorgangs, kein
 * Rücksprung an seinen Anfang — sonst stünde derselbe Termin sofort wieder in der
 * Queue, die ihn gerade freigegeben hat.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'events')
  await requireCommunityPermission(event, 'events.moderate')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  // Datentür als Operator — get belegt die Zugehörigkeit (fremd → 404).
  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  const verdict = canRestoreEvent(row.status)
  if (!verdict.allowed) {
    throw createError({
      status: 409,
      statusText: 'Only hidden events can be restored',
      data: { code: verdict.reason },
    })
  }

  const permissions = withPublishedRead(row.$permissions, event)
  await db.updatePermissions(EVENTS_TABLE, id, permissions)
    .catch((error) => { throw toH3Error(error, 'Could not restore event') })
  const updated = await db.update<EventRow>(EVENTS_TABLE, id, { status: 'published' })
    .catch((error) => { throw toH3Error(error, 'Could not restore event') })

  await applyEventCoverVisibility(event, { ...updated, $permissions: permissions })

  return { ok: true }
})
