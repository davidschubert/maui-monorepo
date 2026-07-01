import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminUserListResponse, AdminUserRow } from '../../../../shared/types/admin'

const PAGE_SIZE = 25
const FETCH_CAP = 500 // Obergrenze für den In-Memory-Sort nach Presence

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

  const admin = createAdminClient(event)

  // Online-User über die Appwrite Presences API (frisch gefiltert). Map
  // userId → updatedAt („zuletzt aktiv"); Anwesenheit = online.
  const presence = new Map<string, string>()
  for (const p of await listOnlinePresences(event)) presence.set(p.userId, p.updatedAt)

  // Sortierung nach Presence ("jetzt aktiv") → in-memory, da Appwrite nicht über
  // unsere presence-Table ordnen kann. Sonst: server-seitige Appwrite-Ordnung.
  if (rawSort === 'active') {
    const all: Models.User<Models.Preferences>[] = []
    let offset = 0
    let total = 0
    while (all.length < FETCH_CAP) {
      const res = await admin.users.list({
        queries: [Query.limit(100), Query.offset(offset)],
        ...(search ? { search } : {}),
      })
      total = res.total
      all.push(...res.users)
      if (res.users.length < 100 || all.length >= res.total) break
      offset += 100
    }
    const rows = all.map(u => toRow(u, presence))
    rows.sort((a, b) => {
      const ta = a.lastSeen ? Date.parse(a.lastSeen) : 0
      const tb = b.lastSeen ? Date.parse(b.lastSeen) : 0
      return dir === 'asc' ? ta - tb : tb - ta
    })
    // total = echte Gesamtzahl (nicht rows.length, das auf FETCH_CAP geklemmt
    // wäre) → Anzeige/Pagination stimmen auch jenseits von 500 Nutzern.
    return { total, users: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) }
  }

  // Appwrite-orderbare Felder (accessedAt ist NICHT orderbar → keine Spalte)
  const SORTABLE = new Set(['name', 'email', '$createdAt', 'status', 'emailVerification', 'labels'])
  const sort = SORTABLE.has(rawSort) ? rawSort : '$createdAt'

  const result = await admin.users.list({
    queries: [
      dir === 'asc' ? Query.orderAsc(sort) : Query.orderDesc(sort),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
    ...(search ? { search } : {}),
  })

  return { total: result.total, users: result.users.map(u => toRow(u, presence)) }
})
