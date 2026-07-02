import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { COMMENTS_TABLE, type Comment } from '../../shared/types/comment'

// Obergrenze pro Kommentar — verhindert Notification-Spam über eine lange
// @-Liste; mehr als eine Handvoll echter Erwähnungen gibt es praktisch nicht.
const MAX_MENTIONS = 5
// Teilnehmer-Fenster: die jüngsten Kommentare des Targets reichen als
// Auflösungsbasis (Autocomplete im Client speist sich aus demselben Set).
const PARTICIPANT_CAP = 1_000

export interface Mention {
  userId: string
  name: string
}

/**
 * Löst `@Name`-Erwähnungen im Kommentar-Content gegen die TEILNEHMER des
 * Targets auf (Autoren vorhandener Kommentare, case-insensitiv). Namen sind
 * keine eindeutigen Handles — deshalb ist die Menge bewusst auf den Thread
 * begrenzt: wer dort nie kommentiert hat, ist nicht erwähnbar (und kann
 * nicht von Fremden über Namensraten benachrichtigt werden). Best effort:
 * Fehler liefern [] und brechen das Kommentieren nie ab.
 */
export async function resolveMentions(
  event: H3Event,
  opts: { targetId: string, targetType: string, content: string, excludeUserIds: string[] },
): Promise<Mention[]> {
  if (!opts.content.includes('@')) return []

  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const res = await admin.tablesDB.listRows<Comment>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: COMMENTS_TABLE,
      queries: [
        Query.equal('targetId', opts.targetId),
        Query.equal('targetType', opts.targetType),
        Query.orderDesc('$createdAt'),
        Query.limit(PARTICIPANT_CAP),
      ],
    })

    const participants = new Map<string, string>() // userId → Name
    for (const row of res.rows) {
      if (row.authorId && row.authorName && row.status !== 'deleted') {
        participants.set(row.authorId, row.authorName)
      }
    }

    const exclude = new Set(opts.excludeUserIds)
    const contentLower = opts.content.toLowerCase()
    const mentions: Mention[] = []
    for (const [userId, name] of participants) {
      if (exclude.has(userId)) continue
      if (!contentLower.includes(`@${name.toLowerCase()}`)) continue
      mentions.push({ userId, name })
      if (mentions.length >= MAX_MENTIONS) break
    }
    return mentions
  }
  catch {
    return []
  }
}
