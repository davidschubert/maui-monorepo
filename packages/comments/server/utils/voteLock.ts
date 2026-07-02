/**
 * In-Process-Serialisierung pro Kommentar für den Recount+Write-Pfad des Votings.
 *
 * Ohne Lock können zwei parallele Votes verschiedener User so verzahnen, dass
 * der spätere Write auf einem VERALTETEN Recount basiert (Lost Update) — die
 * Zähler driften dann bis zum nächsten Vote. Innerhalb des Locks liest der
 * Recount frisch, nachdem die eigene Vote-Row geschrieben ist → der letzte
 * Write enthält alle bis dahin gelandeten Votes.
 *
 * GRENZE: wirkt pro Nitro-Prozess. Bei horizontaler Skalierung (mehrere
 * Instanzen) bräuchte es Appwrite-Transactions (seit 1.9) oder einen externen
 * Lock — für das Single-Server-Deployment (Phase 17) bewusst ausreichend;
 * Drift wäre auch dann selbstheilend beim nächsten Vote.
 */
const queues = new Map<string, Promise<unknown>>()

export async function serializePerComment<T>(commentId: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(commentId) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(fn)
  queues.set(commentId, run)
  try {
    return await run
  }
  finally {
    if (queues.get(commentId) === run) queues.delete(commentId)
  }
}
