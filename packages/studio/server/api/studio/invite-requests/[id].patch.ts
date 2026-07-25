import { z } from 'zod'
import { INVITE_REQUESTS_TABLE, type InviteRequestRow } from '../../../../shared/types/inviteRequest'

/**
 * Betreiber: eine Anfrage ablehnen oder zurückstellen (sites.manage).
 *
 * Bewusst OHNE Mail an den Anfragenden: eine automatische Absage ist eine
 * Nachricht, die man selbst formulieren will — oder gar nicht schickt. Die
 * Zeile verschwindet damit aus „neu", die Adresse bleibt (er kann erneut
 * fragen, dann taucht sie wieder auf).
 *
 * Zuweisen und Erinnern laufen NICHT hierüber (eigene Route mit Mailversand).
 */
const bodySchema = z.object({
  status: z.enum(['declined', 'deferred', 'new']),
}).strict()

export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })
  const body = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const current = await admin.tablesDB.getRow<InviteRequestRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: INVITE_REQUESTS_TABLE,
    rowId: id,
  }).catch(() => null)
  if (!current) throw createError({ status: 404, statusText: 'Request not found' })

  // Eine eingelöste Anfrage ist Geschichte, kein Zustand zum Umschalten.
  if ((current.status || 'new') === 'redeemed') {
    throw createError({ status: 409, statusText: 'Already redeemed' })
  }

  const row = await admin.tablesDB.updateRow<InviteRequestRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: INVITE_REQUESTS_TABLE,
    rowId: id,
    data: { status: body.status },
  }).catch((error) => { throw toH3Error(error, 'Could not update request') })

  logEvent('info', 'invite.request_status', { requestId: row.$id, status: body.status })
  return { id: row.$id, status: row.status }
})
