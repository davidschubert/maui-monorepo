import { ACTIVITIES_TABLE } from '../../../shared/types/activity'

/**
 * Einzelnen Feed-Eintrag löschen (Moderation).
 *
 * DATENTÜR (C1b): `remove` belegt die Zugehörigkeit VOR dem Löschen — ein
 * fremder Eintrag antwortet 404 wie einer, den es nicht gibt. `as:'operator'`
 * ist fachlich nötig, weil die Rows bewusst ohne User-delete-Permission
 * entstehen (recordActivity): die Autorität ist die Capability, nicht eine
 * Row-Permission. Der Admin-Client umgeht Row-Permissions, damit ist die Tür
 * hier die EINZIGE Mandanten-Grenze.
 *
 * AUTORISIERUNG (S3): `requireSitePermission` — `activity.manage` IST eine
 * Site-Capability (ADMIN-Bündel, tenantAuthz.ts), und /dashboard/activity
 * verlangt genau sie. Site-Rolle vor protokolliertem Operator-Break-Glass;
 * ohne Mandanten-Kontext (Silo) weiterhin globales Label. Das `await` ist
 * Pflicht — ohne wäre der Gate fail-open.
 */
export default defineEventHandler(async (event) => {
  await requireSitePermission(event, 'activity.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing activity id' })
  }

  await tenantDb(event, { as: 'operator' }).remove(ACTIVITIES_TABLE, id, 'Activity not found')

  return { ok: true }
})
