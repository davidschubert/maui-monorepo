import { INVITE_REQUESTS_TABLE, type InviteRequestRow } from '../../../../../shared/types/inviteRequest'
import { assignCode, remindCode } from '../../../../utils/inviteRequests'
import { sendInviteMail } from '../../../../utils/inviteMail'

/**
 * Betreiber: Code zuweisen bzw. erinnern (sites.manage).
 *
 * EIN Endpunkt für beides, weil es technisch dasselbe ist: ein frischer,
 * an die Adresse gebundener Code geht per Mail raus. Der Unterschied ist nur,
 * ob vorher schon einer draußen war (dann wird er gesperrt und der Zähler
 * hochgesetzt).
 *
 * Der Klartext verlässt den Server NUR in der Mail — die Antwort enthält ihn
 * nicht, das Log auch nicht. Genau deshalb kann eine Erinnerung nicht denselben
 * Code schicken: wir kennen ihn selbst nicht mehr.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const request = await admin.tablesDB.getRow<InviteRequestRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: INVITE_REQUESTS_TABLE,
    rowId: id,
  }).catch(() => null)
  if (!request) throw createError({ status: 404, statusText: 'Request not found' })

  if ((request.status || 'new') === 'redeemed') {
    throw createError({ status: 409, statusText: 'Already redeemed' })
  }

  const isReminder = (request.status || 'new') === 'assigned'
  const result = isReminder
    ? await remindCode(event, request)
    : await assignCode(event, request)

  const sent = await sendInviteMail(event, {
    to: request.email,
    code: result.code,
    locale: request.locale || 'de',
    reminder: isReminder,
  })

  // Die Mail ist der einzige Weg, auf dem der Code den Server verlässt. Kommt
  // sie nicht raus, muss der Betreiber das SOFORT sehen — sonst wartet er auf
  // eine Reaktion, die nie kommen kann.
  if (!sent) {
    logEvent('error', 'invite.mail_failed', { requestId: request.$id, codeId: result.codeId })
    throw createError({ status: 502, statusText: 'Code assigned, but the email could not be sent' })
  }

  return { ok: true, reminder: isReminder, fromStock: result.fromStock }
})
