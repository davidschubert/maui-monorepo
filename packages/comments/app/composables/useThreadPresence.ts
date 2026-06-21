import type { InjectionKey } from 'vue'
import type { Models } from 'node-appwrite'

/** Composer meldet Tippen an die Thread-Presence (von CommentSection bereitgestellt) */
export const commentTypingKey: InjectionKey<(active: boolean) => void> = Symbol('comment-typing')

interface PresenceUser { userId: string, userName: string, typing: boolean }
interface PresenceResponse { count: number, users: PresenceUser[] }

const HEARTBEAT_MS = 20_000
const POLL_MS = 15_000
const TYPING_RESET_MS = 3_000
const TYPING_THROTTLE_MS = 1_500

/**
 * Thread-Presence (#10): zeigt, wer einen Kommentar-Thread gerade ansieht und
 * wer tippt. Baut auf dem Presence-Backend auf (scope '<type>:<id>'):
 * Heartbeat solange gemountet, Realtime + Poll für die Liste, setTyping mit
 * Auto-Reset. Gäste sehen nur die Anwesenheit (kein eigener Heartbeat).
 */
export function useThreadPresence(targetType: string, targetId: string) {
  const config = useRuntimeConfig()
  const auth = useAuthStore()
  const scope = `${targetType}:${targetId}`

  const present = ref<PresenceUser[]>([])
  const others = computed(() => present.value.filter(u => u.userId !== auth.user?.$id))
  const typingOthers = computed(() => others.value.filter(u => u.typing))
  const viewerCount = computed(() => present.value.length)

  let typing = false
  let lastTypingSent = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let typingReset: ReturnType<typeof setTimeout> | undefined

  async function refresh() {
    try {
      const res = await $fetch<PresenceResponse>('/api/presence/count', { query: { scope } })
      present.value = res.users ?? []
    }
    catch {
      // best effort
    }
  }

  function beat() {
    if (!auth.user) return
    void $fetch('/api/presence/heartbeat', { method: 'POST', body: { scope, typing } }).catch(() => {})
  }

  function setTyping(active: boolean) {
    if (!auth.user) return
    if (active) {
      typing = true
      clearTimeout(typingReset)
      typingReset = setTimeout(() => { typing = false; beat() }, TYPING_RESET_MS)
      // gedrosselt sofort senden, damit andere das Tippen schnell sehen
      if (Date.now() - lastTypingSent > TYPING_THROTTLE_MS) {
        lastTypingSent = Date.now()
        beat()
      }
    }
    else {
      typing = false
      clearTimeout(typingReset)
      beat()
    }
  }

  // Realtime auf Presence-Rows DIESES Threads (Setup-Scope → sauberes Cleanup)
  useRealtimeRows<Models.Row & { scope: string }>(
    config.public.appwriteDatabaseId,
    'presence',
    () => { void refresh() },
    { where: payload => payload.scope === scope },
  )

  onMounted(() => {
    void refresh()
    if (!auth.user) return
    beat()
    heartbeatTimer = setInterval(beat, HEARTBEAT_MS)
    pollTimer = setInterval(refresh, POLL_MS)
  })

  onScopeDispose(() => {
    clearInterval(heartbeatTimer)
    clearInterval(pollTimer)
    clearTimeout(typingReset)
    if (auth.user) {
      void $fetch('/api/presence/leave', { method: 'POST', body: { scope }, keepalive: true }).catch(() => {})
    }
  })

  return { others, typingOthers, viewerCount, setTyping }
}
