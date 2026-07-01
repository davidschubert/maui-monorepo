const REVIEWING_PREFIX = 'reviewing:'

/**
 * Claim-Lock für die Moderations-Queue: solange ein Moderator eine Meldung
 * bearbeitet, trägt seine Presence (Appwrite Presences API, Core-Primitive)
 * die action `reviewing:<key>`. Andere Moderatoren sehen darüber, dass die
 * Meldung gerade in Bearbeitung ist ("Mod X bearbeitet gerade") — verhindert
 * Doppelarbeit. `others` schließt die eigene Presence bereits aus.
 */
export function useModerationPresence() {
  const state = usePresenceState()
  const { others } = usePresence(u => typeof u.action === 'string' && u.action.startsWith(REVIEWING_PREFIX))

  // key (z.B. 'comment:<id>') → Name des ersten anderen prüfenden Moderators
  const reviewers = computed(() => {
    const map = new Map<string, string>()
    for (const u of others.value) {
      const key = u.action!.slice(REVIEWING_PREFIX.length)
      if (!map.has(key)) map.set(key, u.userName)
    }
    return map
  })

  /** Meldung `<key>` beanspruchen (genau eine gleichzeitig — die action ist ein Feld). */
  function claim(key: string) {
    state.setAction(`${REVIEWING_PREFIX}${key}`)
  }

  /** Anspruch aufgeben (Modal geschlossen / Aktion fertig). */
  function release() {
    state.setAction(undefined)
  }

  onScopeDispose(release)

  return { reviewers, claim, release }
}
