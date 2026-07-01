import type { ComputedRef, InjectionKey } from 'vue'

/** Composer meldet Tippen an die Thread-Presence (von CommentSection bereitgestellt) */
export const commentTypingKey: InjectionKey<(active: boolean) => void> = Symbol('comment-typing')
/** Antwort-Formular meldet „ich antworte auf <commentId>" (oder undefined = fertig) */
export const commentReplyingKey: InjectionKey<(commentId?: string) => void> = Symbol('comment-replying')

/** Pro-Kommentar-Presence für die Items: wer antwortet / liest wo. */
export interface ThreadPresenceCtx {
  /** commentId → andere User, die gerade darauf antworten */
  replyingOthers: ComputedRef<Map<string, PresenceUser[]>>
  /** commentId → andere User, die gerade dort lesen (Scroll-Position) */
  nearOthers: ComputedRef<Map<string, PresenceUser[]>>
  /** Meine Lese-Position (sichtbarster Kommentar) melden */
  setNear: (commentId?: string) => void
}
export const threadPresenceKey: InjectionKey<ThreadPresenceCtx> = Symbol('thread-presence')

const TYPING_RESET_MS = 3_000

/** commentId → User gruppieren (nur die mit gesetztem Schlüssel) */
function groupByKey(users: PresenceUser[], key: (u: PresenceUser) => string | undefined): Map<string, PresenceUser[]> {
  const map = new Map<string, PresenceUser[]>()
  for (const u of users) {
    const k = key(u)
    if (!k) continue
    const list = map.get(k)
    if (list) list.push(u)
    else map.set(k, [u])
  }
  return map
}

/**
 * Thread-Presence: wer schaut einen Kommentar-Thread gerade an / tippt / antwortet
 * / liest wo. Setzt den scope der EIGENEN Presence (usePresenceState) auf
 * '<type>:<id>' und leitet die scope-gefilterten anderen Betrachter ab. Läuft auf
 * der Appwrite Presences API (Core-Primitive).
 */
export function useThreadPresence(targetType: string, targetId: string) {
  const scope = `${targetType}:${targetId}`
  const state = usePresenceState()
  const { user } = useCurrentUser()
  const live = usePresence(u => u.scope === scope)

  // SSR-Erststand: rendert die Presence-Leiste sofort mit dem serverseitig
  // ermittelten Betrachterstand (via /api/presence/count), sodass sie nach einem
  // harten Reload nicht erst nach einem Client-Roundtrip nachlädt. Sobald der
  // Live-Reader (client-only) seinen ersten list()-Aufruf hat, übernimmt er.
  const { data: initial } = useFetch<{ count: number, users: { userId: string, userName: string, typing: boolean, avatarUrl: string }[] }>(
    '/api/presence/count',
    { query: { scope }, default: () => ({ count: 0, users: [] }) },
  )
  const initialUsers = computed<PresenceUser[]>(() => (initial.value?.users ?? []).map(u => ({
    userId: u.userId, userName: u.userName, avatarUrl: u.avatarUrl || undefined, typing: u.typing, scope,
  })))

  // Bis der Live-Reader geladen hat: SSR-Erststand. Danach: Live (auch wenn leer).
  const present = computed(() => live.loaded.value ? live.present.value : initialUsers.value)
  const others = computed(() => present.value.filter(u => u.userId !== user.value?.$id))
  const typingOthers = computed(() => others.value.filter(u => u.typing))
  const viewerCount = computed(() => present.value.length)

  let typingReset: ReturnType<typeof setTimeout> | undefined
  function setTyping(active: boolean) {
    state.setTyping(active)
    clearTimeout(typingReset)
    // Auto-Reset: nach 3s ohne weiteren Tastenschlag wieder auf false
    if (active) typingReset = setTimeout(() => state.setTyping(false), TYPING_RESET_MS)
  }

  const replyingOthers = computed(() => groupByKey(others.value, u => u.replyingTo))
  const nearOthers = computed(() => groupByKey(others.value, u => u.near))

  onMounted(() => state.setScope(scope))
  onScopeDispose(() => {
    clearTimeout(typingReset)
    state.setScope(undefined)
    state.setTyping(false)
    state.setReplyingTo(undefined)
    state.setNear(undefined)
  })

  return {
    present,
    others,
    typingOthers,
    viewerCount,
    setTyping,
    setReplyingTo: state.setReplyingTo,
    setNear: state.setNear,
    replyingOthers,
    nearOthers,
  }
}
