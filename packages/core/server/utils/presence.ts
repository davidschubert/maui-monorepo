/**
 * Deterministische Presence-Row-ID je (User, Scope). 'global' nutzt direkt die
 * userId (eine Row pro User); für Thread-Scopes ein kurzer djb2-Hash, damit die
 * ID gültig (a-z0-9_) und <36 Zeichen bleibt.
 */
export function presenceRowId(userId: string, scope: string): string {
  if (scope === 'global') return userId
  let hash = 5381
  for (let i = 0; i < scope.length; i++) {
    hash = ((hash << 5) + hash + scope.charCodeAt(i)) >>> 0
  }
  return `${userId}_${hash.toString(36)}`
}
