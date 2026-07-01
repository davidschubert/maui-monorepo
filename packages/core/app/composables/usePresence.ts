import type { Ref } from 'vue'
import { Channel, Presences, Query } from 'appwrite'

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
  /** Tab ist gerade im Hintergrund (anderer Tab/minimiert) — „im anderen Tab" */
  away?: boolean
}

interface RawPresence { userId: string, status?: string, $updatedAt?: string, metadata?: Record<string, unknown> }

const HEARTBEAT_MS = 20_000
// Realtime ist der schnelle Pfad: WS-Upsert → Event → Reader-Refresh in ~280ms
// (gemessen, konsistent). Der Poll ist nur Backstop, falls ein Event verloren geht
// oder der WS kurz weg ist → 20s. WICHTIG: setzt einen GESUNDEN realtime-Worker
// voraus (ein degradierter/gecrashter Worker stellt Events nicht zu — dann Container
// neu erstellen: `docker compose up -d --no-deps appwrite-realtime`).
const POLL_MS = 20_000
// „online jetzt" bestimmen wir über die Aktualität (updatedAt). Das Fenster MUSS
// deutlich größer sein als die Heartbeat-Lücke eines Hintergrund-Tabs, sonst
// FLACKERT dessen Avatar (fällt raus + kommt beim nächsten gedrosselten Heartbeat
// zurück). Browser drosseln setInterval in versteckten Tabs auf ~1×/Minute (nach
// längerer Zeit „intensive throttling"). 180s toleriert das mit Puffer → ein
// offener/anschauender Tab bleibt STABIL sichtbar. Sauberes Verlassen entfernt die
// Presence ohnehin sofort (leave-Beacon); nur ein Absturz lingert bis zum Fenster.
const FRESH_MS = 180_000

function isFresh(p: RawPresence): boolean {
  return !!p.$updatedAt && (Date.now() - Date.parse(p.$updatedAt) < FRESH_MS)
}

// Die geteilte, JWT-authentifizierte Realtime-Verbindung + der Cookie-Client für
// presences.list() leben in useRealtimeClient (auto-import): EINE WS für die ganze
// App (Presence + Row-Streams). Verifiziert: Event-Round-Trip ~280ms.

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
  away: p.metadata?.away === true,
})

// ════════════ MEINE Presence — EINE Upsert-Autorität pro Tab ════════════
// Eine Presence pro User (presenceId = userId); metadata trägt scope/action/
// typing. Verschiedene Features (Thread, Moderation, Edit) SETZEN Teile davon,
// statt jeweils eigene (kollidierende) Presences zu upserten.
interface Meta { scope?: string, action?: string, typing?: boolean, page?: string, replyingTo?: string, near?: string, away?: boolean }
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

  // Zwei Schreibwege — bewusst kombiniert:
  // 1) HTTP-Heartbeat (Admin-Client, server-seitig): ZUVERLÄSSIG (Cookie-Auth,
  //    funktioniert immer), aber löst KEIN Realtime-Event aus.
  // 2) WS-Upsert (realtime.upsertPresence, JWT-authentifiziert): löst das
  //    Realtime-Event `presences.[id].upsert` aus → andere sehen es SOFORT.
  //    Nur der WS-Handler publiziert Events (verifiziert am 1.9.5-Quellcode).
  //    Owner-Rechte (update/delete) nötig, sonst wirft der Handler beim Update.
  function upsertHttp() {
    if (!auth.user) return
    $fetch('/api/presence/heartbeat', { method: 'POST', body: { ...myMeta.value } }).catch(() => {})
  }
  function upsertWs() {
    const user = auth.user
    if (!user) return
    const realtime = sharedRealtime()
    ensureRealtimeJwt()
      .then(() => {
        // Ohne gültigen JWT ist die WS ein Gast → upsertPresence würde server-
        // seitig „User must be authorized" werfen. Dann nur der HTTP-Heartbeat
        // (upsertHttp) trägt die Presence — kein Realtime-Event, aber sauber.
        if (!hasRealtimeJwt()) return
        const prefs = user.prefs as { avatarUrl?: string } | undefined
        const metadata: Record<string, unknown> = { userName: user.name, ...myMeta.value }
        if (prefs?.avatarUrl) metadata.avatarUrl = prefs.avatarUrl
        return realtime.upsertPresence({
          presenceId: user.$id,
          status: 'online',
          permissions: [`read("users")`, `update("user:${user.$id}")`, `delete("user:${user.$id}")`],
          metadata,
        })
      })
      .catch(() => {}) // WS nicht verfügbar → HTTP-Heartbeat trägt die Presence
  }
  function upsert() {
    upsertHttp()
    upsertWs()
  }

  if (!stateStarted) {
    stateStarted = true
    watch(() => auth.user?.$id, id => { if (id) upsert() }, { immediate: true })
    watch(myMeta, upsert, { deep: true })
    setInterval(upsert, HEARTBEAT_MS)
    // `away` = Tab im Hintergrund (anderer Tab/minimiert). Bei JEDEM Sichtbarkeits-
    // wechsel aktualisieren + sofort upserten: andere sehen den „im anderen Tab"-
    // Status, UND das Frische-Fenster startet genau dann neu, wenn die setInterval-
    // Drosselung eines versteckten Tabs beginnt (Avatar bleibt so stabil sichtbar).
    const syncAway = () => {
      const away = document.visibilityState !== 'visible'
      if (myMeta.value.away !== away) myMeta.value = { ...myMeta.value, away }
    }
    syncAway() // initialer Stand (falls Tab beim Laden schon versteckt ist)
    document.addEventListener('visibilitychange', () => { syncAway(); upsert() })
    window.addEventListener('focus', () => { syncAway(); upsert() })
    // Tab schließt / Seite verlässt (kein SPA-Wechsel) → Presence sofort entfernen,
    // statt bis zur Expiry (~120s) „online" zu bleiben. sendBeacon überlebt Unload.
    window.addEventListener('pagehide', () => {
      if (auth.user) navigator.sendBeacon('/api/presence/leave')
    })
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
  // false, bis der erste list()-Aufruf durch ist → Konsumenten können bis dahin
  // einen SSR-Erststand zeigen (kein Nachladen nach hartem Reload).
  const loaded = ref(false)

  if (import.meta.server) {
    const empty = computed(() => [] as PresenceUser[])
    return { present: empty, others: empty, typingOthers: empty, viewerCount: computed(() => 0), loaded }
  }

  const auth = useAuthStore()
  const client = realtimeCookieClient()
  const realtime = sharedRealtime()
  const presences = new Presences(client)

  const others = computed(() => present.value.filter(u => u.userId !== auth.user?.$id))
  const typingOthers = computed(() => others.value.filter(u => u.typing))
  const viewerCount = computed(() => present.value.length)

  let sub: { close?: () => void, unsubscribe?: () => void } | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined

  async function refresh() {
    try {
      // Explizites Limit statt Default 25 → auch bei vielen Online-Usern vollständig.
      const res = await presences.list({ queries: [Query.limit(200)] })
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

  // disposed-Flag: onMounted ist async — wird die Komponente während eines
  // awaits unmounted (schnelle Navigation), liefe onScopeDispose mit noch
  // undefiniertem sub/pollTimer und der Rest des Setups würde DANACH einen
  // ewigen 20s-Poll + eine tote Subscription starten (Leak).
  let disposed = false
  onMounted(async () => {
    await ensureRealtimeJwt() // WS authentifizieren, BEVOR er sich verbindet (sonst Gast)
    if (disposed) return
    await refresh()
    if (disposed) return
    loaded.value = true
    try {
      sub = await realtime.subscribe(Channel.presences(), scheduleRefresh)
      if (disposed) { void (sub.unsubscribe ?? sub.close)?.(); sub = undefined; return }
    }
    catch { /* Poll trägt die Anwesenheit */ }
    pollTimer = setInterval(refresh, POLL_MS)
  })
  onScopeDispose(() => {
    disposed = true
    clearInterval(pollTimer)
    clearTimeout(refreshTimer)
    try { (sub?.unsubscribe ?? sub?.close)?.() }
    catch { /* ignore */ }
  })

  return { present, others, typingOthers, viewerCount, loaded }
}
