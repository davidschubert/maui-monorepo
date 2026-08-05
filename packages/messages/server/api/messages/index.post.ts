import { normalizeHandle } from '../../../../core/shared/handles'
import { createStartConversationSchema } from '../../../schemas/message'
import { RECIPIENT_UNAVAILABLE_CODE } from '../../../shared/messageErrors'

/**
 * EINE KONVERSATION ERÖFFNEN (oder in einer bestehenden weiterschreiben).
 *
 * ── ANGESPROCHEN WIRD ÜBER DEN HANDLE ────────────────────────────────────
 * Nicht über eine User-Id. Handles sind je Community eindeutig
 * (`core/shared/handles.ts`), sie sind das, was ein Mensch tippt, und die
 * Suche dahinter (`GET /api/handles/search`) antwortet ohnehin nur
 * Mitgliedern. Eine rohe Id im Body wäre ein Adressbuch für jeden, der Ids
 * durchprobiert — und sie würde die Community-Grenze umgehen, die der Handle
 * schon zieht.
 *
 * ── EIN UNBEKANNTER HANDLE ENDET WIE EINE SPERRE ─────────────────────────
 * Derselbe Fehler, derselbe Code. Ein eigenes „gibt es nicht" wäre ein
 * Verzeichnisdienst: wer Namen durchprobiert, erführe aus der Antwort, wer in
 * dieser Community ist — und aus der Kombination mit dem anderen Code, wer ihn
 * gesperrt hat.
 *
 * ── DIE SCHUTZPRÜFUNG STEHT VOR DEM SCHREIBEN ────────────────────────────
 * `requireMayOpenConversation` bündelt Owner-Schalter, Vertrauensstufe,
 * Sperre und alle drei Rate-Budgets (server/utils/messageGate.ts). Eine Route,
 * die sich die Reihenfolge selbst zusammenstellt, wäre die Stelle, an der
 * beim nächsten Mal eine Prüfung fehlt.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const body = await readValidatedBody(event, createStartConversationSchema().parse)

  const handle = normalizeHandle(body.handle)
  const owners = await resolveHandleOwners(event, [handle])
  const recipientId = owners.get(handle) ?? ''

  // Unbekannt ODER man selbst: dieselbe Antwort. „An sich selbst schreiben"
  // ist kein Produkt, und eine eigene Fehlermeldung dafür wäre die einzige,
  // aus der man etwas ableiten könnte.
  if (!recipientId || recipientId === user.$id) {
    throw createError({
      status: 403,
      statusText: 'This person does not accept messages from you',
      data: { code: RECIPIENT_UNAVAILABLE_CODE },
    })
  }

  const participants = [user.$id, recipientId]

  /**
   * DIE UNTERSCHEIDUNG „eröffnen" vs. „antworten" hängt an der ZEILE, nicht am
   * Aufruf: wer diese Route ein zweites Mal für dasselbe Gegenüber benutzt,
   * schreibt in die bestehende Konversation — und unterliegt dann dem
   * kleineren Regelsatz (kein TL-Gate, § 2.4 Folge 1). Andersherum wäre es
   * eine Lücke: das Tages-Budget fürs Eröffnen ließe sich sonst umgehen,
   * indem man dieselbe Route nimmt.
   */
  const known = await findConversation(event, participants)
  if (known) {
    await requireMayReply(event, user.$id, recipientId)
    const message = await appendMessage(event, known, user.$id, body.body)
    return { conversationId: known.$id, messageId: message.$id, created: false }
  }

  await requireMayOpenConversation(event, user.$id, recipientId)
  const { conversation } = await openConversation(event, participants, user.$id)
  const message = await appendMessage(event, conversation, user.$id, body.body)
  return { conversationId: conversation.$id, messageId: message.$id, created: true }
})
