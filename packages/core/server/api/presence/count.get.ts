import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'

const FRESH_MS = 45_000 // als online gilt, wer innerhalb 45s gepingt hat
const STALE_MS = 120_000 // ältere Rows werden best-effort aufgeräumt

type PresenceRow = Models.Row & { userId: string, userName: string, typing: boolean }

/**
 * Anzahl aktuell anwesender User für einen scope ('global' = eingeloggt/live,
 * '<type>:<id>' = in einem Thread). Zählt nur frische lastSeen; räumt sehr alte
 * Rows nebenbei auf. Degradiert auf 0, falls die presence-Table fehlt.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const scope = String(getQuery(event).scope ?? 'global')

  try {
    const fresh = await admin.tablesDB.listRows<PresenceRow>({
      databaseId, tableId: 'presence',
      queries: [
        Query.equal('scope', scope),
        Query.greaterThan('lastSeen', new Date(Date.now() - FRESH_MS).toISOString()),
        Query.limit(100),
      ],
    })

    // Best-effort-Cleanup veralteter Rows (nicht awaited)
    void admin.tablesDB.listRows({
      databaseId, tableId: 'presence',
      queries: [
        Query.equal('scope', scope),
        Query.lessThan('lastSeen', new Date(Date.now() - STALE_MS).toISOString()),
        Query.limit(25),
      ],
    }).then(stale => Promise.all(
      stale.rows.map(row => admin.tablesDB.deleteRow({ databaseId, tableId: 'presence', rowId: row.$id }).catch(() => {})),
    )).catch(() => {})

    // Identität der Anwesenden (Name/Avatar) nur an eingeloggte Aufrufer geben —
    // anonyme Besucher bekommen nur die Anzahl, keine PII.
    const authed = !!event.context.user

    // Avatar-URLs der anwesenden User aus den Account-prefs (für die Avatar-Gruppe)
    const ids = authed ? fresh.rows.map(row => row.userId) : []
    const avatars = new Map<string, string>()
    if (ids.length) {
      try {
        const users = await admin.users.list({ queries: [Query.equal('$id', ids), Query.limit(ids.length)] })
        for (const u of users.users) {
          const url = (u.prefs as { avatarUrl?: string })?.avatarUrl
          if (typeof url === 'string' && url) avatars.set(u.$id, url)
        }
      }
      catch {
        // ohne Avatare weiter (Initialen-Fallback)
      }
    }

    return {
      scope,
      count: fresh.total,
      users: authed
        ? fresh.rows.map(row => ({
            userId: row.userId,
            userName: row.userName,
            typing: row.typing === true,
            avatarUrl: avatars.get(row.userId) ?? '',
          }))
        : [],
    }
  }
  catch {
    return { scope, count: 0, users: [] }
  }
})
