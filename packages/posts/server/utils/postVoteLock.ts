/**
 * Recount+Write pro Post serialisieren (Muster comments/voteLock): parallele
 * Votes verschiedener User könnten sonst einen Write auf VERALTETEM Recount
 * hinterlassen (Lost Update — Zähler driften bis zum nächsten Vote).
 * In-memory — reicht für Single-Instanz (wie das Rate-Limit).
 */
const queues = new Map<string, Promise<unknown>>()

export async function serializePerPost<T>(postId: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(postId) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(fn)
  queues.set(postId, run)
  try {
    return await run
  }
  finally {
    if (queues.get(postId) === run) queues.delete(postId)
  }
}
