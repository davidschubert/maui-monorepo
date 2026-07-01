import { Client, Realtime, Channel, Presences } from 'appwrite'

export interface PresenceUser { userId: string, userName: string, typing: boolean }

/** Struktur eines Presence-Payloads (Realtime-Event UND REST-Liste). */
interface PresencePayload { userId: string, status?: string, metadata?: Record<string, unknown> }

const HEARTBEAT_MS = 20_000
const POLL_MS = 25_000 // Sicherheitsnetz für abgelaufene Presences (Server-Expiry)
const TYPING_RESET_MS = 3_000
const TYPING_THROTTLE_MS = 1_500

// Ein geteilter SDK-Client/Realtime pro Tab (eine WS-Verbindung, multiplexed).
let sharedClient: Client | null = null
let sharedRealtime: Realtime | null = null
function getRealtime(endpoint: string, projectId: string): { client: Client, realtime: Realtime } {
  if (!sharedClient) sharedClient = new Client().setEndpoint(endpoint).setProject(projectId)
  if (!sharedRealtime) sharedRealtime = new Realtime(sharedClient)
  return { client: sharedClient, realtime: sharedRealtime }
}

/**
 * Anwesenheit für einen `scope` über Appwrites **Presences API** (self-hostbar
 * seit 1.9.5): upsertPresence (Heartbeat, Server-Expiry) + Channel.presences()-
 * Subscription statt eigener presence-Table + manuellem Stale-Cleanup.
 *
 * - Eine Presence pro User (presenceId = userId), scope/Name/typing als metadata.
 * - Subscription filtert nach metadata.scope: Wechselt ein User den Thread,
 *   ändert sich sein scope → hier wird er entfernt. Abgelaufene Presences fängt
 *   der Poll (presences.list, expired auto-gefiltert) ab.
 * - SSR: no-op. Gäste sehen Anwesenheit, senden aber keinen Heartbeat.
 */
export function usePresence(scope: string) {
  const map = ref(new Map<string, PresenceUser>())
  const present = computed(() => [...map.value.values()])

  if (import.meta.server) {
    const empty = computed(() => [] as PresenceUser[])
    return { present: empty, others: empty, typingOthers: empty, viewerCount: computed(() => 0), setTyping: () => {} }
  }

  const config = useRuntimeConfig()
  const auth = useAuthStore()
  const { client, realtime } = getRealtime(config.public.appwriteEndpoint, config.public.appwriteProjectId)
  const presences = new Presences(client)

  const others = computed(() => present.value.filter(u => u.userId !== auth.user?.$id))
  const typingOthers = computed(() => others.value.filter(u => u.typing))
  const viewerCount = computed(() => present.value.length)

  let typing = false
  let lastTypingSent = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let typingReset: ReturnType<typeof setTimeout> | undefined
  let sub: { close?: () => void, unsubscribe?: () => void } | undefined

  const toUser = (p: PresencePayload): PresenceUser => ({
    userId: p.userId,
    userName: String(p.metadata?.userName ?? 'User'),
    typing: p.metadata?.typing === true,
  })

  function applyPresence(p: PresencePayload) {
    const next = new Map(map.value)
    if (p.metadata?.scope === scope && p.status) next.set(p.userId, toUser(p))
    else next.delete(p.userId)
    map.value = next
  }

  function upsert() {
    if (!auth.user) return
    realtime.upsertPresence({
      presenceId: auth.user.$id,
      status: 'online',
      // Ohne read-Permission wäre die Presence nur für den Besitzer sichtbar →
      // andere Thread-Teilnehmer (eingeloggt) müssen sie lesen können.
      permissions: [`read("users")`],
      metadata: { scope, userName: auth.user.name, typing },
    }).catch(() => {})
  }

  async function refresh() {
    try {
      const res = await presences.list()
      const next = new Map<string, PresenceUser>()
      for (const p of (res.presences ?? []) as unknown as PresencePayload[]) {
        if (p.metadata?.scope === scope && p.status) next.set(p.userId, toUser(p))
      }
      map.value = next
    }
    catch {
      // best effort
    }
  }

  function setTyping(active: boolean) {
    if (!auth.user) return
    if (active) {
      typing = true
      clearTimeout(typingReset)
      typingReset = setTimeout(() => { typing = false; upsert() }, TYPING_RESET_MS)
      if (Date.now() - lastTypingSent > TYPING_THROTTLE_MS) { lastTypingSent = Date.now(); upsert() }
    }
    else {
      typing = false
      clearTimeout(typingReset)
      upsert()
    }
  }

  onMounted(async () => {
    await refresh()
    try {
      sub = await realtime.subscribe(Channel.presences(), (res: { payload: PresencePayload }) => applyPresence(res.payload))
    }
    catch {
      // Subscription-Fehler → Poll trägt die Anwesenheit (degradiert)
    }
    if (auth.user) {
      upsert()
      heartbeatTimer = setInterval(upsert, HEARTBEAT_MS)
    }
    pollTimer = setInterval(refresh, POLL_MS)
  })

  onScopeDispose(() => {
    clearInterval(heartbeatTimer)
    clearInterval(pollTimer)
    clearTimeout(typingReset)
    try { (sub?.unsubscribe ?? sub?.close)?.() }
    catch { /* ignore */ }
  })

  return { present, others, typingOthers, viewerCount, setTyping }
}
