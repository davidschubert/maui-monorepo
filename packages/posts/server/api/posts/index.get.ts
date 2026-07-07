import { Query } from 'node-appwrite'
import { POSTS_TABLE, type CommunityPost, type FeedPost, type PostListResponse } from '../../../shared/types/post'

const PAGE_SIZE = 25

/**
 * Community-Feed: published-Posts, neueste zuerst, Cursor-paginiert.
 * Öffentlich lesbar (Gäste sehen den Feed — posten/stimmen erst nach Login).
 * Vorab publish-on-read für fällige geplante Posts (Plan P4).
 */
export default defineEventHandler(async (event): Promise<PostListResponse> => {
  await publishDuePosts(event)

  const cursor = getQuery(event).cursor
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const res = await tablesDB.listRows<CommunityPost>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: POSTS_TABLE,
    queries: [
      Query.equal('status', 'published'),
      Query.orderDesc('publishedAt'),
      Query.limit(PAGE_SIZE),
      ...(typeof cursor === 'string' && cursor.length > 0 ? [Query.cursorAfter(cursor)] : []),
    ],
  }).catch((error) => {
    // Ungültiger Cursor / abgelaufene Session als 4xx durchreichen, nicht als 500
    throw toH3Error(error, 'Could not load posts')
  })

  const userId = event.context.user?.$id ?? null
  const [avatars, pollStates, postVotes] = await Promise.all([
    resolveAvatars(event, res.rows.map(row => row.authorId)),
    pollStatesFor(event, res.rows, userId),
    postVotesFor(event, res.rows, userId),
  ])

  const rows: FeedPost[] = res.rows.map(row => ({
    ...row,
    authorAvatarUrl: avatars.get(row.authorId),
    poll: pollStates.get(row.$id),
    myPostVote: postVotes.get(row.$id) ?? null,
  }))

  return {
    rows,
    nextCursor: res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})
