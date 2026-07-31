import { RESERVED_SUBDOMAINS } from '../../../../schemas/tenant'
import { RESERVED_NAME_MAX, RESERVED_NAME_RE } from '../../../../shared/reservedNames'
import { RESERVED_NAMES_TABLE } from '../../../utils/reservedNames'

/**
 * Betreiber: einen selbst gesperrten Namen wieder freigeben (sites.manage).
 *
 * System-Namen bleiben tabu. In der Tabelle können sie gar nicht stehen (die
 * POST-Route lehnt sie ab), aber der Wächter bleibt: er kostet nichts und hält
 * die Regel dort sichtbar, wo sie gilt — sonst wäre eine von Hand angelegte
 * Zeile der Weg, `login.pukalani.app` freizugeben.
 *
 * IDEMPOTENT: ein 404 beim Löschen ist kein Fehler, sondern der gewünschte
 * Zustand. Zweimal klicken darf keine rote Meldung geben.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const name = getRouterParam(event, 'name')
  if (!name || name.length > RESERVED_NAME_MAX || !RESERVED_NAME_RE.test(name)) {
    throw createError({ status: 400, statusText: 'Invalid name' })
  }
  if (RESERVED_SUBDOMAINS.has(name)) {
    throw createError({ status: 409, statusText: 'Platform names cannot be removed', data: { code: 'system' } })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  await admin.tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: RESERVED_NAMES_TABLE,
    rowId: name,
  }).catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 404) return
    throw toH3Error(error, 'Could not release name')
  })

  return { ok: true }
})
