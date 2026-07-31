import { Query } from 'node-appwrite'
import { EVENTS_TABLE, type EventRow } from '../../../shared/types/event'

/**
 * Verwaltungs-Liste (dashboard/events): ALLE Status inkl. drafts — deshalb
 * Datentür als Operator (drafts tragen bewusst keine Read-Permission; der
 * Admin-Client umgeht Row-Permissions, die Tür ist hier die einzige Grenze)
 * hinter events.manage.
 *
 * AUTORISIERUNG (N5): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 */
export default defineEventHandler(async (event): Promise<{ rows: EventRow[] }> => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  await requireCommunityPermission(event, 'events.manage')

  const res = await tenantDb(event, { as: 'operator' }).list<EventRow>(EVENTS_TABLE, [
    Query.orderDesc('startAt'), Query.limit(100),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load events')
  })

  return { rows: res.rows }
})
