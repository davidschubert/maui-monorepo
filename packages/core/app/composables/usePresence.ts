import type { Ref } from 'vue'
import { Client, Realtime, Channel, Presences } from 'appwrite'

export interface PresenceUser {
  userId: string
  userName: string
  /** Profilbild-URL (aus den Account-prefs) — sonst Initialen-Fallback */
  avatarUrl?: string
  /** Was der User gerade ansieht, z.B. 'post:demo-post' (Thread) */
  scope?: string
  /** Was der User gerade tut, z.B. 'reviewing:report:42' oder 'editing:changelog:7' */
  action?: string
  typing: boolean
  /** Welche (Dashboard-)Seite der User gerade betrachtet, z.B. '/dashboard/users/42' */
  page?: string
  /** ID des Kommentars, auf den der User gerade antwortet */
  replyingTo?: string
  /** ID des Kommentars, bei dem der User gerade liest (Scroll-Position) */
  near?: string
}

interface RawPresence { userId: string, status?: string, $updatedAt?: string, metadata?: Record<string, unknown> }

const HEARTBEAT_MS = 20_000
const POLL_MS = 20_000 // hält die Aktualitäts-Filterung frisch
// „online jetzt" bestimmen wir über die Aktualität (updatedAt). Das Fenster MUSS
// größer sein als die Heartbeat-Lücke eines Hintergrund-Tabs: Browser drosseln
// setInterval in versteckten Tabs auf ~1×/Minute. Bei 60s Fenster fiele ein
// offener-aber-versteckter Tab fälschlich raus → 90s toleriert die Drosselung.
const FRESH_MS = 90_000

function isFresh(p: RawPresence): boolean {
  return !!p.$updatedAt && (Date.now() - Date.parse(p.$updatedAt) < FRESH_MS)
}

// Ein geteilter SDK-Client/Realtime pro Tab (eine WS-Verbindung, multiplexed).
let sharedClient: Client | null = null
let sharedRealtime: Realtime | null = null
function shared() {
  const config = useRuntimeConfig()
  if (!sharedClient) sharedClient = new Client().setEndpoint(config.public.appwriteEndpoint).setProject(config.public.appwriteProjectId)
  if (!sharedRealtime) sharedRealtime = new Realtime(sharedClient)
  return { client: sharedClient, realtime: sharedRealtime }
}

const toUser = (p: RawPresence): PresenceUser => ({
  userId: p.userId,
  userName: String(p.metadata?.userName ?? 'User'),
  avatarUrl: typeof p.metadata?.avatarUrl === 'string' ? p.metadata.avatarUrl : undefined,
  scope: typeof p.metadata?.scope === 'string' ? p.metadata.scope : undefined,
  action: typeof p.metadata?.action === 'string' ? p.metadata.action : undefined,
  typing: p.metadata?.typing === true,
  page: typeof p.metadata?.page === 'string' ? p.metadata.page : undefined,
  replyingTo: typeof p.metadata?.replyingTo === 'string' ? p.metadata.replyingTo : undefined,
  near: typeof p.metadata?.near === 'string' ? p.metadata.near : undefined,
})

// ════════════ MEINE Presence — EINE Upsert-Autorität pro Tab ════════════
// Eine Presence pro User (presenceId = userId); metadata trägt scope/action/
// typing. Verschiedene Features (Thread, Moderation, Edit) SETZEN Teile davon,
// statt jeweils eigene (kollidierende) Presences zu upserten.
interface Meta { scope?: string, action?: string, typing?: boolean, page?: string, replyingTo?: string, near?: string }
let stateStarted = false
const myMeta: Ref<Meta> = ref({})

/**
 * Verwaltet die EIGENE Presence des eingeloggten Users (Appwrite Presences API,
 * self-hostbar seit 1.9.5): upsert bei Login/metadata-Änderung + Heartbeat,
 * Server-Expiry räumt ab. `read("users")` macht sie für eingeloggte User lesbar.
 * SSR: no-op. Idempotenter Start (Modul-Flag) → genau ein Heartbeat/Watcher.
 */
export function usePresenceState() {
  const noop = {
    setScope: (_?: string) => {}, setAction: (_?: string) => {}, setTyping: (_: boolean) => {},
    setPage: (_?: string) => {}, setReplyingTo: (_?: string) => {}, setNear: (_?: string) => {},
  }
  if (import.meta.server) return noop

  const auth = useAuthStore()

  // Write server-seitig: der Browser darf seine Presence im SSR-Cookie-Setup
  // nicht selbst schreiben (Web-SDK-Client ohne Session → WS-Upsert als Guest
  // verworfen, PUT /presences → 401). Die Route upsertet mit dem Admin-Client.
  function upsert() {
    if (!auth.user) return
    $fetch('/api/presence/heartbeat', { method: 'POST', body: { ...myMeta.value } }).catch(() => {})
  }

  if (!stateStarted) {
    stateStarted = true
    watch(() => auth.user?.$id, id => { if (id) upsert() }, { immediate: true })
    watch(myMeta, upsert, { deep: true })
    setInterval(upsert, HEARTBEAT_MS)
    // Hintergrund-Tabs drosseln setInterval. Bei JEDEM Sichtbarkeitswechsel sofort
    // auffrischen — auch beim VERSTECKEN: so startet das Frische-Fenster genau dann
    // neu, wenn die Drosselung beginnt (maximaler Puffer, bis der nächste – seltene
    // – Heartbeat feuert). Bei Rückkehr ist die Presence ohnehin sofort wieder frisch.
    document.addEventListener('visibilitychange', upsert)
    window.addEventListener('focus', upsert)
  }

  // Setter no-oppen bei gleichem Wert → keine redundanten Upserts (z.B. pro Tastenschlag).
  return {
    setScope: (scope?: string) => { if (myMeta.value.scope !== scope) myMeta.value = { ...myMeta.value, scope } },
    setAction: (action?: string) => { if (myMeta.value.action !== action) myMeta.value = { ...myMeta.value, action } },
    setTyping: (typing: boolean) => { if (myMeta.value.typing !== typing) myMeta.value = { ...myMeta.value, typing } },
    setPage: (page?: string) => { if (myMeta.value.page !== page) myMeta.value = { ...myMeta.value, page } },
    setReplyingTo: (replyingTo?: string) => { if (myMeta.value.replyingTo !== replyingTo) myMeta.value = { ...myMeta.value, replyingTo } },
    setNear: (near?: string) => { if (myMeta.value.near !== near) myMeta.value = { ...myMeta.value, near } },
  }
}

// ════════════ Reader — ANDERE Presences, nach predicate gefiltert ════════════
/**
 * Liest die Presences anderer (via Channel.presences() + presences.list()),
 * gefiltert per `predicate` (z.B. `u => u.scope === scope` für einen Thread,
 * `u => u.action === 'reviewing:report:42'` für Moderations-Locks, oder Default
 * = alle für „wer ist online"). SSR: leer.
 */
export function usePresence(predicate: (u: PresenceUser) => boolean = () => true) {
  const map = ref(new Map<string, PresenceUser>())
  const present = computed(() => [...map.value.values()])

  if (import.meta.server) {
    const empty = computed(() => [] as PresenceUser[])
    return { present: empty, others: empty, typingOthers: empty, viewerCount: computed(() => 0) }
  }

  const auth = useAuthStore()
  const { client, realtime } = shared()
  const presences = new Presences(client)

  const others = computed(() => present.value.filter(u => u.userId !== auth.user?.$id))
  const typingOthers = computed(() => others.value.filter(u => u.typing))
  const viewerCount = computed(() => present.value.length)

  let sub: { close?: () => void, unsubscribe?: () => void } | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined

  async function refresh() {
    try {
      const res = await presences.list()
      const next = new Map<string, PresenceUser>()
      for (const p of (res.presences ?? []) as unknown as RawPresence[]) {
        const u = toUser(p)
        if (p.status && isFresh(p) && predicate(u)) next.set(u.userId, u)
      }
      map.value = next
    }
    catch {
      // best effort
    }
  }

  // Realtime-Events sind nur der „etwas hat sich geändert"-Trigger — den
  // autoritativen Zustand holt refresh() via list() (kennt $updatedAt für die
  // Aktualitäts-Filterung, unabhängig vom Payload-Shape). Kurz entprellt, um
  // Event-Bursts (mehrere Tipp-Toggles) zu einem list()-Call zu bündeln.
  function scheduleRefresh() {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => { void refresh() }, 250)
  }

  onMounted(async () => {
    await refresh()
    try { sub = await realtime.subscribe(Channel.presences(), scheduleRefresh) }
    catch { /* Poll trägt die Anwesenheit */ }
    pollTimer = setInterval(refresh, POLL_MS)
  })
  onScopeDispose(() => {
    clearInterval(pollTimer)
    clearTimeout(refreshTimer)
    try { (sub?.unsubscribe ?? sub?.close)?.() }
    catch { /* ignore */ }
  })

  return { present, others, typingOthers, viewerCount }
}
