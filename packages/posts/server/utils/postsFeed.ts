import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { POLL_VOTES_TABLE, POSTS_TABLE, POST_VOTES_TABLE, type CommunityPost, type PollState, type PollVote, type PostVote, type PostVoteValue } from '../../shared/types/post'

/**
 * Die Veröffentlichungs-Permission eines Posts steht seit C18 (2026-07-30)
 * NICHT mehr als Konstante hier: was „veröffentlicht" heißt, entscheidet die
 * Community (`read("any")` öffentlich, `read("label:<communityId>")`
 * geschlossen). Alle Stellen rufen `withPublishedRead()` /
 * `withoutPublishedRead()` (core) — die kennen beide Schreibweisen und räumen
 * nach einem Umschalten auch die alte weg.
 */

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
 * Publish-on-read (Plan P4): fällige scheduled-Posts auf published heben —
 * beim Lesen des Feeds, kein Cron nötig. Datentür als Operator (fremde Rows,
 * aber NUR die des eigenen Mandanten: jeder Feed-GET veröffentlicht die
 * fälligen Posts seiner Community — im Pool bleibt nichts liegen, weil jede
 * Community ihren eigenen Feed liest). Best-effort: ein Fehler hier darf den
 * Feed-GET nie scheitern lassen.
 */
export async function publishDuePosts(event: H3Event): Promise<void> {
  try {
    const db = tenantDb(event, { as: 'operator' })
    const now = new Date().toISOString()

    const due = await db.list<CommunityPost>(POSTS_TABLE, [
      Query.equal('status', 'scheduled'),
      Query.lessThanEqual('scheduledAt', now),
      Query.limit(25),
    ])

    for (const row of due.rows) {
      const updated = await db.update<CommunityPost>(POSTS_TABLE, row.$id, {
        status: 'published',
        publishedAt: now,
      })
      // Autor-Rechte bleiben, Leserecht für alle kommt dazu (zweiter Schritt:
      // die Tür trennt Daten- und Permission-Writes bewusst)
      await db.updatePermissions(POSTS_TABLE, row.$id, withPublishedRead(row.$permissions, event))
      await recordActivity(event, {
        actorId: updated.authorId,
        actorName: updated.authorName,
        type: 'post.published',
        objectType: 'post',
        objectId: updated.$id,
        link: '/feed',
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
 * Datentür als Operator: die Vote-Rows sind nur für den jeweiligen Voter
 * lesbar, der userId-Filter unten ist die fachliche Eingrenzung.
 */
export async function postVotesFor(
  event: H3Event,
  posts: CommunityPost[],
  userId: string | null,
): Promise<Map<string, PostVoteValue>> {
  if (!userId || posts.length === 0) return new Map()
  const db = tenantDb(event, { as: 'operator' })
  const res = await db.list<PostVote>(POST_VOTES_TABLE, [
    Query.equal('userId', userId),
    Query.equal('postId', posts.map(p => p.$id)),
    Query.limit(posts.length),
  ]).catch(() => ({ rows: [] as PostVote[] }))
  return new Map(res.rows.map(vote => [vote.postId, vote.value]))
}

/**
 * Poll-Zustände für eine Seite Posts: eigene Stimmen aus EINEM Query (kein
 * N+1); Zählung per gebündelter Count-Queries NUR wo Ergebnisse sichtbar
 * sind (eigene Stimme oder Poll beendet — Plan P3). Datentür als Operator,
 * weil poll_votes bewusst keine breite Read-Permission tragen.
 */
export async function pollStatesFor(
  event: H3Event,
  posts: CommunityPost[],
  userId: string | null,
): Promise<Map<string, PollState>> {
  const polls = posts.filter(p => p.type === 'poll')
  if (polls.length === 0) return new Map()

  const db = tenantDb(event, { as: 'operator' })
  const now = Date.now()

  const myVotes = new Map<string, number>()
  if (userId) {
    // Query.equal ist auf 100 Werte begrenzt — eine Feed-Seite (25) bleibt weit darunter
    const res = await db.list<PollVote>(POLL_VOTES_TABLE, [
      Query.equal('userId', userId),
      Query.equal('postId', polls.map(p => p.$id)),
      Query.limit(polls.length),
    ])
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
        db.count(POLL_VOTES_TABLE, [
          Query.equal('postId', poll.$id),
          Query.equal('optionIndex', index),
        ]),
      ))
      totalVotes = counts.reduce((sum, c) => sum + c, 0)
    }

    states.set(poll.$id, { options, counts, totalVotes, myVote, results, ended })
  }
  return states
}
