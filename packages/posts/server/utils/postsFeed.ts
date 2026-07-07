import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { POLL_VOTES_TABLE, POSTS_TABLE, POST_VOTES_TABLE, type CommunityPost, type PollState, type PollVote, type PostVote, type PostVoteValue } from '../../shared/types/post'

/** read("any") — published-Posts tragen sie; hidden/deleted/scheduled nicht */
export const POST_READ_ANY = Permission.read(Role.any())

/** pollOptions-JSON defensiv parsen (kein Vertrauen in die Row) */
export function parsePollOptions(row: Pick<CommunityPost, 'pollOptions'>): string[] {
  if (!row.pollOptions) return []
  try {
    const parsed: unknown = JSON.parse(row.pollOptions)
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === 'string') : []
  }
  catch {
    return []
  }
}

/**
 * Publish-on-read (Plan P4): fällige scheduled-Posts SYSTEMWEIT auf published
 * heben — beim Lesen des Feeds, kein Cron nötig. Admin-Client (fremde Rows);
 * best-effort: ein Fehler hier darf den Feed-GET nie scheitern lassen.
 * Verzögertes Publish meldet den Feed-Eintrag (recordActivity) nach.
 */
export async function publishDuePosts(event: H3Event): Promise<void> {
  try {
    const config = useRuntimeConfig(event)
    const databaseId = config.public.appwriteDatabaseId
    const admin = createAdminClient(event)
    const now = new Date().toISOString()

    const due = await admin.tablesDB.listRows<CommunityPost>({
      databaseId,
      tableId: POSTS_TABLE,
      queries: [
        Query.equal('status', 'scheduled'),
        Query.lessThanEqual('scheduledAt', now),
        Query.limit(25),
      ],
    })

    for (const row of due.rows) {
      const updated = await admin.tablesDB.updateRow<CommunityPost>({
        databaseId,
        tableId: POSTS_TABLE,
        rowId: row.$id,
        data: { status: 'published', publishedAt: now },
        // Autor-Rechte bleiben, Leserecht für alle kommt dazu
        permissions: [...new Set([...row.$permissions, POST_READ_ANY])],
      })
      await recordActivity(event, {
        actorId: updated.authorId,
        actorName: updated.authorName,
        type: 'post.published',
        objectType: 'post',
        objectId: updated.$id,
        link: '/community',
        metadata: { snippet: updated.title || updated.body.slice(0, 140) },
      })
    }
  }
  catch (error) {
    console.error('[posts] publish-on-read fehlgeschlagen (nächster Feed-GET versucht es erneut):', error)
  }
}

/**
 * Eigene Up-/Downvotes für eine Seite Posts — EIN Query (kein N+1).
 * Admin-Client: die Vote-Rows sind nur für den jeweiligen Voter lesbar.
 */
export async function postVotesFor(
  event: H3Event,
  posts: CommunityPost[],
  userId: string | null,
): Promise<Map<string, PostVoteValue>> {
  if (!userId || posts.length === 0) return new Map()
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<PostVote>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: POST_VOTES_TABLE,
    queries: [Query.equal('userId', userId), Query.equal('postId', posts.map(p => p.$id)), Query.limit(posts.length)],
  }).catch(() => ({ rows: [] as PostVote[] }))
  return new Map(res.rows.map(vote => [vote.postId, vote.value]))
}

/**
 * Poll-Zustände für eine Seite Posts: eigene Stimmen aus EINEM Query (kein
 * N+1); Zählung per gebündelter Count-Queries NUR wo Ergebnisse sichtbar
 * sind (eigene Stimme oder Poll beendet — Plan P3). Admin-Client, weil
 * poll_votes bewusst keine breite Read-Permission tragen.
 */
export async function pollStatesFor(
  event: H3Event,
  posts: CommunityPost[],
  userId: string | null,
): Promise<Map<string, PollState>> {
  const polls = posts.filter(p => p.type === 'poll')
  if (polls.length === 0) return new Map()

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)
  const now = Date.now()

  const myVotes = new Map<string, number>()
  if (userId) {
    // Query.equal ist auf 100 Werte begrenzt — eine Feed-Seite (25) bleibt weit darunter
    const res = await admin.tablesDB.listRows<PollVote>({
      databaseId,
      tableId: POLL_VOTES_TABLE,
      queries: [Query.equal('userId', userId), Query.equal('postId', polls.map(p => p.$id)), Query.limit(polls.length)],
    })
    for (const vote of res.rows) myVotes.set(vote.postId, vote.optionIndex)
  }

  const states = new Map<string, PollState>()
  for (const poll of polls) {
    const options = parsePollOptions(poll)
    const ended = !!poll.pollEndsAt && Date.parse(poll.pollEndsAt) <= now
    const myVote = myVotes.get(poll.$id) ?? null
    const results = myVote !== null || ended

    let counts: number[] = []
    let totalVotes = 0
    if (results) {
      counts = await Promise.all(options.map((_, index) =>
        admin.tablesDB.listRows({
          databaseId,
          tableId: POLL_VOTES_TABLE,
          queries: [Query.equal('postId', poll.$id), Query.equal('optionIndex', index), Query.limit(1)],
        }).then(r => r.total),
      ))
      totalVotes = counts.reduce((sum, c) => sum + c, 0)
    }

    states.set(poll.$id, { options, counts, totalVotes, myVote, results, ended })
  }
  return states
}
