import type { InjectionKey } from 'vue'

/** Composer meldet Tippen an die Thread-Presence (von CommentSection bereitgestellt) */
export const commentTypingKey: InjectionKey<(active: boolean) => void> = Symbol('comment-typing')

const TYPING_RESET_MS = 3_000

/**
 * Thread-Presence: wer schaut einen Kommentar-Thread gerade an / tippt. Setzt
 * den scope der EIGENEN Presence (usePresenceState) auf '<type>:<id>' und liest
 * die anderen Betrachter scope-gefiltert (usePresence). Läuft auf der Appwrite
 * Presences API (Core-Primitive).
 */
export function useThreadPresence(targetType: string, targetId: string) {
  const scope = `${targetType}:${targetId}`
  const state = usePresenceState()
  const { present, others, typingOthers, viewerCount } = usePresence(u => u.scope === scope)

  let typingReset: ReturnType<typeof setTimeout> | undefined
  function setTyping(active: boolean) {
    state.setTyping(active)
    clearTimeout(typingReset)
    // Auto-Reset: nach 3s ohne weiteren Tastenschlag wieder auf false
    if (active) typingReset = setTimeout(() => state.setTyping(false), TYPING_RESET_MS)
  }

  onMounted(() => state.setScope(scope))
  onScopeDispose(() => {
    clearTimeout(typingReset)
    state.setScope(undefined)
    state.setTyping(false)
  })

  return { present, others, typingOthers, viewerCount, setTyping }
}
