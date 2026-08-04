import { EVENTS_TABLE, type EventRow } from '../../shared/types/event'

/**
 * MELDBAR: Termine (F15, 2026-08-03 — schließt Moderations-Audit Befund 4).
 *
 * DIE VORGESCHICHTE: an der Termin-Detailseite hing bis zum 2026-08-01 ein
 * Melde-Knopf. Er schickte `targetType: 'event'` an /api/reports und versprach
 * „ein Moderator sieht sich das an" — nur kannte keine Queue den Typ. Die Zeilen
 * entstanden, wurden gezählt und nie von einem Menschen gesehen. Der Knopf wurde
 * deshalb ENTFERNT, nicht repariert: lieber kein Knopf als ein Knopf ins Leere.
 *
 * Diese Registrierung ist die Gegenleistung dafür, dass er zurückkommt. Sie ist
 * die Zusage, die `reportTargets.ts` einfordert: WEIL hier registriert wird, gibt
 * es eine Queue (`/dashboard/events-moderation` + `/api/events/moderation`) und
 * einen Menschen, der entscheidet. Fällt eines von beidem weg, gehört auch diese
 * Zeile weg.
 *
 * Die Prüfung läuft durch die Datentür als OPERATOR — wie bei posts: ein Termin
 * aus einer FREMDEN Community ist damit „nicht vorhanden", eine erfundene Id
 * ebenso. Ausgeblendete und abgesagte Termine bleiben meldbar: die Zeile
 * existiert, und ein zweiter Meldegrund zu einem bereits ausgeblendeten Termin
 * ist für den Moderator eine Information, kein Müll.
 *
 * KEIN PRODUKT-GATE HIER: `requirePlanProduct` braucht einen Plan-Kontext, den
 * eine Ziel-Prüfung nicht hat — und sie würde ohnehin nur „nicht vorhanden"
 * sagen, was die Datentür bei einem fremden Mandanten schon tut.
 */
export default defineNitroPlugin(() => {
  registerReportTarget('event', async (event, targetId) => {
    const row = await tenantDb(event, { as: 'operator' })
      .get<EventRow>(EVENTS_TABLE, targetId, 'Event not found')
      .catch(() => null)
    return !!row
  })
})
