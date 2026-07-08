import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminUserListResponse, AdminUserRow } from '../../../../shared/types/admin'

const PAGE_SIZE = 25
// In-Memory-Sort nach Presence: Users werden per Cursor VOLLSTÄNDIG geladen;
// die harte Grenze ist ein Notanker (mit Log statt stillem Kappen).
const FETCH_PAGE = 100
const FETCH_HARD_CAP = 5_000

/** Auf sichere Felder reduzieren — Server-User-Objekte enthalten Hash-Felder */
function toRow(user: Models.User<Models.Preferences>, online: Map<string, string>): AdminUserRow {
  const prefs = user.prefs as { avatarUrl?: string }
  return {
    $id: user.$id,
    name: user.name,
    email: user.email,
    avatarUrl: typeof prefs?.avatarUrl === 'string' ? prefs.avatarUrl : '',
    $createdAt: user.$createdAt,
    accessedAt: user.accessedAt,
    emailVerification: user.emailVerification,
    phoneVerification: user.phoneVerification,
    status: user.status,
    labels: user.labels ?? [],
    online: online.has(user.$id),
    lastSeen: online.get(user.$id) ?? '',
  }
}

export default defineEventHandler(async (event): Promise<AdminUserListResponse> => {
  requirePermission(event, 'users.manage')

  const query = getQuery(event)
  const search = String(query.search ?? '').trim()
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const rawSort = String(query.sort ?? '')
  const dir = query.dir === 'asc' ? 'asc' : 'desc'
  // People-Filter (Nav-Unterpunkte): 'new' = registration-Query (server-seitig),
  // 'active' = accessedAt-Fenster (nicht queryfähig → In-Memory-Pfad unten)
  const filter = query.filter === 'active' || query.filter === 'new' ? query.filter : null

  const admin = createAdminClient(event)

  // Online-User über die Appwrite Presences API (frisch gefiltert). Map
  // userId → updatedAt („zuletzt aktiv"); Anwesenheit = online.
  const presence = new Map<string, string>()
  for (const p of await listOnlinePresences(event)) presence.set(p.userId, p.updatedAt)

  // 'new'-Filter: server-seitige registration-Query (in beiden Pfaden)
  const newFilterQueries = filter === 'new'
    ? [Query.greaterThan('registration', new Date(Date.now() - USERS_NEW_WINDOW_MS).toISOString())]
    : []

  // Sortierung nach Presence ("jetzt aktiv") ODER 'active'-Filter → in-memory,
  // da accessedAt weder orderbar noch queryfähig ist. Sonst: server-seitig.
  if (rawSort === 'active' || filter === 'active') {
    const all: Models.User<Models.Preferences>[] = []
    let cursor: string | undefined
    let total = 0
    // Cursor statt Offset: verschiebt sich die Menge während der Pagination
    // (Signup), dopplen/fehlen bei Offsets Zeilen — der Cursor ist stabil.
    while (all.length < FETCH_HARD_CAP) {
      const res = await admin.users.list({
        queries: [...newFilterQueries, Query.limit(FETCH_PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
        ...(search ? { search } : {}),
      })
      total = res.total
      all.push(...res.users)
      if (res.users.length < FETCH_PAGE || all.length >= res.total) break
      cursor = res.users.at(-1)!.$id
    }
    if (all.length >= FETCH_HARD_CAP) {
      console.warn(`[admin/users] active-Sort an FETCH_HARD_CAP (${FETCH_HARD_CAP}) gekappt — Sortierung unvollständig.`)
    }
    // 'active'-Filter: nur User mit accessedAt im 30-Tage-Fenster
    const cutoff = Date.now() - USERS_ACTIVE_WINDOW_MS
    const filtered = filter === 'active'
      ? all.filter(u => u.accessedAt && Date.parse(u.accessedAt) >= cutoff)
      : all

    const rows = filtered.map(u => toRow(u, presence))
    rows.sort((a, b) => {
      const ta = a.lastSeen ? Date.parse(a.lastSeen) : 0
      const tb = b.lastSeen ? Date.parse(b.lastSeen) : 0
      return dir === 'asc' ? ta - tb : tb - ta
    })
    // total = echte Gesamtzahl (nicht rows.length, das auf FETCH_CAP geklemmt
    // wäre); beim active-Filter IST die gefilterte Menge die Gesamtzahl.
    return {
      total: filter === 'active' ? rows.length : total,
      users: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    }
  }

  // Appwrite-orderbare Felder (accessedAt ist NICHT orderbar → keine Spalte)
  const SORTABLE = new Set(['name', 'email', '$createdAt', 'status', 'emailVerification', 'labels'])
  const sort = SORTABLE.has(rawSort) ? rawSort : '$createdAt'

  const result = await admin.users.list({
    queries: [
      ...newFilterQueries,
      dir === 'asc' ? Query.orderAsc(sort) : Query.orderDesc(sort),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
    ...(search ? { search } : {}),
  })

  return { total: result.total, users: result.users.map(u => toRow(u, presence)) }
})
