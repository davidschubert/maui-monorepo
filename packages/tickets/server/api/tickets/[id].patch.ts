import { ticketPatchSchema } from '../../../schemas/ticket'
import { TICKETS_TABLE, type TicketMember, type TicketRow } from '../../../shared/types/ticket'

/**
 * Ticket ändern — Felder, Erledigt-Toggle und Move (listId und/oder position)
 * in einer Route; der Client patcht optimistisch und Realtime synct den Rest.
 * P4: Listen-Move, Erledigt-Toggle und NEUE Zuweisungen benachrichtigen
 * Beobachter/Mitglieder (best-effort, blockiert die Antwort nicht).
 */
export default defineEventHandler(async (event): Promise<TicketRow> => {
  const user = requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const body = await readValidatedBody(event, ticketPatchSchema.parse)
  const targetList = body.listId ? await requireTicketList(event, body.listId) : null

  const data: Record<string, unknown> = {}
  if (body.listId !== undefined) data.listId = body.listId
  if (body.position !== undefined) data.position = body.position
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.label !== undefined) data.label = body.label
  if (body.priority !== undefined) data.priority = body.priority
  if (body.effort !== undefined) data.effort = body.effort
  if (body.startAt !== undefined) data.startAt = body.startAt
  if (body.dueAt !== undefined) {
    data.dueAt = body.dueAt
    // neue Fälligkeit → Reminder darf wieder feuern
    data.dueRemindedAt = null
  }
  if (body.checklist !== undefined) data.checklist = body.checklist.length ? JSON.stringify(body.checklist) : ''
  if (body.members !== undefined) data.membersJson = body.members.length ? JSON.stringify(body.members) : ''
  if (body.status !== undefined) {
    data.status = body.status
    data.doneAt = body.status === 'done' ? new Date().toISOString() : null
  }
  if (Object.keys(data).length === 0) {
    throw createError({ status: 400, statusText: 'Empty patch' })
  }

  // Vorzustand nur laden, wenn benachrichtigungsrelevante Felder dabei sind
  const notifyRelevant = body.listId !== undefined || body.status !== undefined || body.members !== undefined
  const before = notifyRelevant ? await requireTicketExists(event, id) : null

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const updated = await tablesDB.updateRow<TicketRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TICKETS_TABLE,
    rowId: id,
    data,
  }).catch((error) => {
    throw toH3Error(error, 'Could not update ticket')
  })

  // Benachrichtigungen best-effort im Hintergrund (Antwort nicht verzögern)
  if (before) {
    void (async () => {
      if (targetList && before.listId !== updated.listId) {
        await notifyTicketPeople(event, updated, {
          title: updated.title,
          body: `Verschoben nach „${targetList.title}"`,
          excludeUserId: user.$id,
        })
      }
      if (body.status !== undefined && before.status !== updated.status) {
        await notifyTicketPeople(event, updated, {
          title: updated.title,
          body: updated.status === 'done' ? 'Als erledigt markiert ✅' : 'Wieder geöffnet',
          excludeUserId: user.$id,
        })
      }
      if (body.members !== undefined) {
        const oldIds = new Set((JSON.parse(before.membersJson || '[]') as TicketMember[]).map(m => m.id))
        const added = (body.members ?? []).filter(m => !oldIds.has(m.id) && m.id !== user.$id)
        for (const member of added) {
          await notify(event, {
            recipientId: member.id,
            type: 'ticket',
            title: updated.title,
            body: 'Dir wurde dieses Ticket zugewiesen',
            link: `/dashboard/tickets?ticket=${updated.$id}`,
            senderId: user.$id,
          })
        }
      }
    })().catch(error => console.warn('[tickets] PATCH-Benachrichtigung fehlgeschlagen:', error))
  }

  return updated
})
