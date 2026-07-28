import { ACTIVITIES_TABLE } from '../../../shared/types/activity'

/**
 * Einzelnen Feed-Eintrag löschen (Moderation). Admin-Client, weil die Rows
 * bewusst ohne User-delete-Permission entstehen (recordActivity) — die
 * Autorität ist die Capability, nicht eine Row-Permission.
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

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  await tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: ACTIVITIES_TABLE,
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Activity not found') })

  return { ok: true }
})
