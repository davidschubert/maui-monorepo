import { z } from 'zod'
import { counterValue } from '../../../shared/conversations'
import { partnerOf } from '../../utils/conversations'
import type { ConversationSummary } from '../../../shared/types/message'

/** Der Posteingang hat eine Liste, keine Ablage — mehr als 100 wären eine Suche. */
const MAX_LIMIT = 100

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
})

/**
 * DER POSTEINGANG: meine Konversationen in dieser Community.
 *
 * ── DIE KONVERSATION IST NICHT DER TEXT ──────────────────────────────────
 * Diese Route liefert Vorschauen, keine Verläufe. Der Text kommt aus
 * `/api/messages/[id]`, und dort steht die Zugehörigkeitsprüfung noch einmal —
 * eine Liste, die schon alles mitschickt, wäre eine Ansicht, die man später
 * nicht mehr einschränken kann.
 *
 * Der HANDLE des Gegenübers wird mitgeliefert, weil die Oberfläche sonst
 * nichts hätte, womit ein Mensch eine Konversation wiedererkennt. Er ist
 * dieselbe Auskunft, die `GET /api/handles/search` jedem Mitglied gibt.
 */
export default defineEventHandler(async (event): Promise<{ conversations: ConversationSummary[] }> => {
  // Produkt-Gate (P4): private Nachrichten sind ab Plan personal enthalten —
  // dieselbe Stufe wie posts, und aus derselben Abhängigkeit heraus (ohne
  // member_counters keine Vertrauensstufe, ohne Stufe kein Absender).
  requirePlanProduct(event, 'messages')

  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  // Der Owner-Schalter gilt auch fürs LESEN: ist das Produkt aus, gibt es hier
  // nichts — sonst stünde ein Posteingang offen, den die Community nie
  // eingeschaltet hat.
  await requireMessagesEnabled(event)

  const { limit } = await getValidatedQuery(event, querySchema.parse)
  const entries = await listInbox(event, user.$id, limit)

  const partnerIds = entries.map(entry => partnerOf(entry.conversation, user.$id)).filter(Boolean)
  // Zwei gebündelte Auflösungen statt zweier je Zeile — eine Liste hat
  // schnell 50 Gegenüber.
  const [names, handles] = await Promise.all([
    resolveUserNames(event, partnerIds),
    resolveUserHandles(event, partnerIds),
  ])

  return {
    conversations: entries.map(({ conversation, member }) => {
      const partnerId = partnerOf(conversation, user.$id)
      return {
        id: conversation.$id,
        partnerId,
        partnerName: names.get(partnerId) ?? '',
        partnerHandle: handles.get(partnerId) ?? '',
        lastMessageAt: conversation.lastMessageAt ?? '',
        lastMessagePreview: conversation.lastMessagePreview ?? '',
        unread: counterValue(member.unread),
      }
    }),
  }
})
