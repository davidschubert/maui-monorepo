/**
 * Anwesende User für einen scope über die Appwrite Presences API.
 * scope 'global' (oder leer) = alle Online-User; '<type>:<id>' = Betrachter eines
 * Threads (metadata.scope). Identität (Name/Avatar) nur an eingeloggte Aufrufer —
 * anonyme Besucher bekommen nur die Anzahl (keine PII).
 */
export default defineEventHandler(async (event) => {
  const scope = String(getQuery(event).scope ?? 'global')
  const all = await listOnlinePresences(event)
  const filtered = scope === 'global' ? all : all.filter(p => p.scope === scope)

  const authed = !!event.context.user
  const avatars = authed
    ? await resolveAvatars(event, filtered.map(p => p.userId))
    : new Map<string, string>()

  return {
    scope,
    count: filtered.length,
    users: authed
      ? filtered.map(p => ({
          userId: p.userId,
          userName: p.userName,
          typing: p.typing,
          avatarUrl: avatars.get(p.userId) ?? '',
        }))
      : [],
  }
})
