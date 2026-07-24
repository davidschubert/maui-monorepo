import { defineStore } from 'pinia'
import type { InjectionKey } from 'vue'
import type {
  Comment,
  CommentListResponse,
  CommentNode,
  SortMode,
  VoteResponse,
  VoteValue,
} from '../../shared/types/comment'
import { buildCommentTree, descendantIds } from '../../shared/thread'
import { applyVoteDelta, nextVoteValue } from '../../shared/vote'

/** Strukturkompatibel zu RealtimeRowEvent<Comment> aus dem Core */
interface RealtimeCommentEvent {
  type: 'create' | 'update' | 'delete'
  payload: Comment
  events: string[]
}

const commentStoreSetup = () => {
  // Beim SSR-Fetch (useAsyncData in CommentSection) MÜSSEN die Browser-Cookies
  // mitgehen, sonst antwortet /api/comments mit der Gast-Sicht und myVotes/
  // myReports hydratisieren leer (eigene Votes nach hartem Reload „weg").
  // useRequestFetch forwarded die Request-Header; im Client = normales $fetch.
  const requestFetch = useRequestFetch()
  const targetId = ref('')
  const targetType = ref('')
  /** Interner Pfad der Seite (für die Reply-Notification) — vom CommentSection gesetzt */
  const targetUrl = ref('')
  const rows = ref<Comment[]>([])
  /** Alle nicht-hidden Kommentare (inkl. deleted-Platzhalter) — Pagination-Sentinel */
  const total = ref(0)
  /** Nur status=active — die Anzeige-Zahl (Überschrift, Landingpage-Stats) */
  const activeTotal = ref(0)
  /** Top-Level-Threads — Basis der Pagination (eine Seite = N Threads + Subtrees) */
  const topLevelTotal = ref(0)
  const userVotes = ref<Record<string, VoteValue>>({})
  /** IDs, die der eingeloggte User offen gemeldet hat (Moderation-Layer) */
  const userReports = ref<Set<string>>(new Set())
  const sortMode = ref<SortMode>('new')
  const loading = ref(false)
  /** Per Realtime eingetroffene fremde Top-Level-Kommentare, gepuffert für die "N neue"-Pill */
  const pending = ref<Comment[]>([])
  const pendingCount = computed(() => pending.value.length)
  /** Antworten auf noch gepufferte Kommentare — werden mit dem Parent geflusht */
  const pendingReplies = ref<Comment[]>([])
  /** IDs, die wir per Moderation (hidden) entfernt haben — für Live-Restore */
  const removedByHide = new Set<string>()

  /** Baum aus der flachen Liste (Top-Level in Server-Reihenfolge, Antworten chronologisch) */
  const threaded = computed<CommentNode[]>(() => buildCommentTree(rows.value))

  function myVote(commentId: string): VoteValue | null {
    return userVotes.value[commentId] ?? null
  }

  function isReportedByMe(commentId: string): boolean {
    return userReports.value.has(commentId)
  }

  /** Eigenen Melde-Status setzen (vom ReportButton via update:reported) */
  function setReported(commentId: string, reported: boolean) {
    const next = new Set(userReports.value)
    if (reported) next.add(commentId)
    else next.delete(commentId)
    userReports.value = next
  }

  function setVote(commentId: string, value: VoteValue | null) {
    if (value === null) {
      userVotes.value = Object.fromEntries(
        Object.entries(userVotes.value).filter(([key]) => key !== commentId),
      ) as Record<string, VoteValue>
    }
    else {
      userVotes.value = { ...userVotes.value, [commentId]: value }
    }
  }

  // Sequenz-Token gegen Out-of-Order-Antworten: zwei schnelle Sortierwechsel
  // starten zwei Fetches — ohne Token gewinnt die zuletzt ANKOMMENDE Antwort
  // (Header zeigt „new", Liste ist „top"-sortiert). Nur die neueste zählt.
  let fetchSeq = 0

  async function fetchComments(id: string, type: string, url?: string) {
    targetId.value = id
    targetType.value = type
    if (url !== undefined) targetUrl.value = url
    loading.value = true
    const seq = ++fetchSeq
    try {
      const response = await requestFetch<CommentListResponse>('/api/comments', {
        query: { targetId: id, targetType: type, sort: sortMode.value },
      })
      if (seq !== fetchSeq) return // eine neuere Anfrage läuft/lief — verwerfen
      rows.value = response.rows
      total.value = response.total
      // Fallback: 10s-Gast-Cache kann direkt nach einem Deploy noch Antworten
      // ohne activeTotal liefern
      activeTotal.value = response.activeTotal ?? response.total
      topLevelTotal.value = response.topLevelTotal
      userVotes.value = response.myVotes
      userReports.value = new Set(response.myReports)
      pending.value = []
      pendingReplies.value = []
      removedByHide.clear()
    }
    catch (error) {
      // Read-Rate-Limit (429, Embed E0-2): still bleiben und die bestehende
      // Liste behalten — der nächste Trigger (Sort/Realtime) holt neu;
      // kein Toast-/Unhandled-Rejection-Spam.
      const status = error as { status?: number, statusCode?: number } | null
      if (status?.status !== 429 && status?.statusCode !== 429) throw error
    }
    finally {
      if (seq === fetchSeq) loading.value = false
    }
  }

  /** Alle restlichen Seiten nachladen (für den „Alle Kommentare laden"-Button) */
  async function loadAll() {
    if (loading.value || rows.value.length >= total.value) return
    loading.value = true
    try {
      // Bis zur Erschöpfung paginieren: Stop, sobald eine Seite KEINE neuen
      // Top-Level-Threads mehr bringt. Robust ohne akkurate Thread-Gesamtzahl
      // (Realtime kann sie zwischen Fetches verschieben). Jede Seite liefert
      // ihre kompletten Subtrees; `seen` dedupliziert Grenzfall-Überschneidungen.
      for (let page = 2; page <= 1000; page++) {
        const response = await requestFetch<CommentListResponse>('/api/comments', {
          query: { targetId: targetId.value, targetType: targetType.value, sort: sortMode.value, page },
        })
        if (!response.rows.length) break
        const seen = new Set(rows.value.map(row => row.$id))
        const fresh = response.rows.filter(row => !seen.has(row.$id))
        if (fresh.length) {
          rows.value = [...rows.value, ...fresh]
          userVotes.value = { ...userVotes.value, ...response.myVotes }
          userReports.value = new Set([...userReports.value, ...response.myReports])
        }
        // Keine neuen Top-Level-Threads auf dieser Seite → fertig
        if (!fresh.some(row => !row.parentId)) break
      }
      // Schutz vor Daten-Inkonsistenz: liefert die API trotz erschöpfter
      // Pagination weniger Rows als total (z. B. unerreichbare Waisen), würde
      // der Button sonst ewig bleiben und ins Leere klicken.
      if (rows.value.length < total.value) total.value = rows.value.length
    }
    finally {
      loading.value = false
    }
  }

  async function setSortMode(mode: SortMode) {
    if (mode === sortMode.value) return
    sortMode.value = mode
    if (targetId.value) await fetchComments(targetId.value, targetType.value)
  }

  /** Optimistic: sofort einfügen, bei Fehler wieder entfernen (Rollback im catch) */
  async function addComment(content: string, parentId?: string) {
    const auth = useAuthStore()
    if (!auth.user) throw new Error('not-logged-in')

    const now = new Date().toISOString()
    const parent = parentId ? rows.value.find(r => r.$id === parentId) : undefined
    const temp: Comment = {
      $id: `temp-${Math.random().toString(36).slice(2)}`,
      $sequence: '',
      $createdAt: now,
      $updatedAt: now,
      $permissions: [],
      $databaseId: '',
      $tableId: '',
      targetId: targetId.value,
      targetType: targetType.value,
      content,
      authorId: auth.user.$id,
      authorName: auth.user.name,
      authorAvatarUrl: (auth.user.prefs as { avatarUrl?: string })?.avatarUrl,
      parentId: parentId ?? null,
      targetUrl: targetUrl.value || null,
      rootId: parent ? (parent.rootId ?? parent.$id) : null,
      depth: parent ? parent.depth + 1 : 0,
      editedAt: null,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      status: 'active',
    }
    rows.value = [temp, ...rows.value]
    total.value += 1
    activeTotal.value += 1

    try {
      const created = await $fetch<Comment>('/api/comments', {
        method: 'POST',
        body: { targetId: targetId.value, targetType: targetType.value, content, parentId, targetUrl: targetUrl.value || undefined },
      })
      // Realtime kann denselben Kommentar parallel schon eingefügt haben (Race
      // zwischen POST-Response und Create-Event). Idempotent abgleichen statt
      // blind temp→created zu mappen, sonst entsteht ein Duplikat.
      const alreadyPresent = rows.value.some(row => row.$id === created.$id)
      rows.value = rows.value.filter(row => row.$id !== temp.$id)
      if (alreadyPresent) { total.value -= 1; activeTotal.value -= 1 } // Realtime hat bereits gezählt
      upsertRow(created)
      return created
    }
    catch (error) {
      // Rollback: optimistisch eingefügten Kommentar wieder entfernen
      rows.value = rows.value.filter(row => row.$id !== temp.$id)
      total.value -= 1
      activeTotal.value -= 1
      throw error
    }
  }

  /**
   * Gast-Kommentar (Embed E4): kein Account — Name+E-Mail gehen an
   * /api/comments/guest. Wie addComment optimistisch, aber authorKind 'guest'
   * und authorId '' (kein Vote/Edit). Die E-Mail wird nur gesendet, nie im
   * Store gehalten.
   */
  async function addGuestComment(content: string, guestName: string, guestEmail: string, parentId?: string) {
    const now = new Date().toISOString()
    const parent = parentId ? rows.value.find(r => r.$id === parentId) : undefined
    const temp: Comment = {
      $id: `temp-${Math.random().toString(36).slice(2)}`,
      $sequence: '', $createdAt: now, $updatedAt: now, $permissions: [], $databaseId: '', $tableId: '',
      targetId: targetId.value,
      targetType: targetType.value,
      content,
      authorId: '',
      authorName: guestName,
      authorKind: 'guest',
      parentId: parentId ?? null,
      targetUrl: targetUrl.value || null,
      rootId: parent ? (parent.rootId ?? parent.$id) : null,
      depth: parent ? parent.depth + 1 : 0,
      editedAt: null,
      upvotes: 0, downvotes: 0, score: 0,
      status: 'active',
    }
    rows.value = [temp, ...rows.value]
    total.value += 1
    activeTotal.value += 1

    try {
      const created = await $fetch<Comment>('/api/comments/guest', {
        method: 'POST',
        body: { targetId: targetId.value, targetType: targetType.value, content, parentId, targetUrl: targetUrl.value || undefined, guestName, guestEmail },
      })
      const alreadyPresent = rows.value.some(row => row.$id === created.$id)
      rows.value = rows.value.filter(row => row.$id !== temp.$id)
      if (alreadyPresent) { total.value -= 1; activeTotal.value -= 1 }
      upsertRow(created)
      return created
    }
    catch (error) {
      rows.value = rows.value.filter(row => row.$id !== temp.$id)
      total.value -= 1
      activeTotal.value -= 1
      throw error
    }
  }

  // In-Flight-Serialisierung pro Kommentar: zwei schnelle Klicks (Doppelklick,
  // Up→Down-Wechsel) starten sonst zwei parallele POSTs — der zweite Snapshot
  // enthielte den optimistischen Stand des ersten, und ein Rollback/Reconcile
  // würde falsche Zähler hinterlassen. Der zweite Klick wartet auf den ersten.
  const voteQueues = new Map<string, Promise<void>>()

  /** Optimistic: Zähler + eigener Vote sofort, Server-Stand reconciled, Rollback bei Fehler */
  async function vote(commentId: string, value: VoteValue) {
    const prev = voteQueues.get(commentId) ?? Promise.resolve()
    const queued = prev.catch(() => {}).then(() => performVote(commentId, value))
    voteQueues.set(commentId, queued)
    try {
      await queued
    }
    finally {
      if (voteQueues.get(commentId) === queued) voteQueues.delete(commentId)
    }
  }

  async function performVote(commentId: string, value: VoteValue) {
    const index = rows.value.findIndex(row => row.$id === commentId)
    if (index === -1) return

    const snapshotRow = { ...rows.value[index]! }
    const snapshotVote = userVotes.value[commentId] ?? null
    const next = nextVoteValue(snapshotVote, value)
    const optimistic = { ...snapshotRow, ...applyVoteDelta(snapshotRow, snapshotVote, next) }

    rows.value.splice(index, 1, optimistic)
    setVote(commentId, next)

    try {
      const response = await $fetch<VoteResponse>(`/api/comments/${commentId}/vote`, {
        method: 'POST',
        body: { value },
      })
      upsertRow(response.comment)
      setVote(commentId, response.myVote)
    }
    catch (error) {
      // Rollback auf den Stand vor dem Klick
      upsertRow(snapshotRow)
      setVote(commentId, snapshotVote)
      throw error
    }
  }

  async function updateComment(commentId: string, content: string) {
    const updated = await $fetch<Comment>(`/api/comments/${commentId}`, {
      method: 'PATCH',
      body: { content },
    })
    upsertRow(updated)
  }

  async function deleteComment(commentId: string) {
    const updated = await $fetch<Comment>(`/api/comments/${commentId}`, { method: 'DELETE' })
    upsertRow(updated)
  }

  function upsertRow(comment: Comment) {
    const index = rows.value.findIndex(row => row.$id === comment.$id)
    if (index === -1) {
      rows.value = [comment, ...rows.value]
      return
    }
    // authorAvatarUrl ist nur angereichert (keine DB-Spalte) — Updates ohne sie
    // (Vote-/Edit-Responses, Realtime) würden sie sonst löschen
    const prev = rows.value[index]!
    // Soft-Delete-Übergang zählt hier zentral (eigener Delete + Realtime-Echo
    // laufen beide durch upsertRow — idempotent, weil prev danach deleted ist)
    if (prev.status === 'active' && comment.status === 'deleted') activeTotal.value = Math.max(0, activeTotal.value - 1)
    const merged = comment.authorAvatarUrl === undefined && prev.authorAvatarUrl !== undefined
      ? { ...comment, authorAvatarUrl: prev.authorAvatarUrl }
      : comment
    rows.value.splice(index, 1, merged)
  }

  /**
   * Entfernt einen Kommentar UND alle (transitiven) geladenen Nachfahren — für
   * Hard-Delete UND Moderation-Hide, damit keine Antworten verwaisen (sie wären
   * sonst wegen ihres parentId aus dem Top-Level gefiltert → unsichtbar, aber
   * noch in total). total sinkt um die Anzahl tatsächlich entfernter Rows.
   */
  function removeWithDescendants(id: string) {
    const toRemove = descendantIds(rows.value, id)
    const removedVisible = rows.value.filter(row => toRemove.has(row.$id)).length
    const removedActive = rows.value.filter(row => toRemove.has(row.$id) && row.status === 'active').length
    activeTotal.value = Math.max(0, activeTotal.value - removedActive)
    rows.value = rows.value.filter(row => !toRemove.has(row.$id))
    pending.value = pending.value.filter(row => !toRemove.has(row.$id))
    // Gepufferte Antworten mit entferntem Ziel/Parent ebenfalls verwerfen
    pendingReplies.value = pendingReplies.value.filter(row => !toRemove.has(row.$id) && !toRemove.has(row.parentId ?? ''))
    total.value = Math.max(0, total.value - removedVisible)
  }

  /** Gepufferte (fremde) Kommentare auf einen Klick in die Liste übernehmen */
  function flushPending() {
    if (!pending.value.length) return
    // Antworten auf gepufferte Parents kommen mit — buildCommentTree hängt sie
    // unabhängig von der Reihenfolge der flachen Liste richtig ein.
    rows.value = [...pending.value, ...pendingReplies.value, ...rows.value]
    total.value += pending.value.length + pendingReplies.value.length
    activeTotal.value += pending.value.length + pendingReplies.value.length
    pending.value = []
    pendingReplies.value = []
  }

  /** Realtime: gezieltes Einfügen/Aktualisieren — kein Full-Refresh */
  function applyRealtime(event: RealtimeCommentEvent) {
    const { type, payload } = event

    if (type === 'delete') {
      // Hard-Delete: Kommentar + alle Nachfahren entfernen (sonst verwaisen Replies)
      removeWithDescendants(payload.$id)
      return
    }

    if (type === 'update') {
      // Moderation-Hide: Kommentar UND geladene Antworten entfernen (sonst
      // verwaisen sie unsichtbar in rows und blähen total auf). Nur der Parent
      // kehrt per Restore zurück; seine Antworten lädt der nächste Fetch nach.
      if (payload.status === 'hidden') { removeWithDescendants(payload.$id); removedByHide.add(payload.$id); return }
      // bereits sichtbar → aktualisieren (Edit, Vote-Score, Report-Badge, Soft-Delete)
      if (rows.value.some(row => row.$id === payload.$id)) { upsertRow(payload); return }
      // nicht (mehr) sichtbar: nur wieder aufnehmen, wenn WIR es per hide entfernt
      // haben und es jetzt wieder sichtbar ist (Restore) — sonst ignorieren, damit
      // Votes/Edits an nicht geladenen (paginierten) Kommentaren nichts einblenden
      if (removedByHide.has(payload.$id) && payload.status === 'active') {
        removedByHide.delete(payload.$id)
        total.value += 1
        activeTotal.value += 1
        upsertRow(payload)
      }
      return
    }

    // create — Duplikate (eigener optimistischer Kommentar, Echo) ignorieren
    if (
      rows.value.some(row => row.$id === payload.$id)
      || pending.value.some(row => row.$id === payload.$id)
      || pendingReplies.value.some(row => row.$id === payload.$id)
    ) return

    const auth = useAuthStore()
    const isOwn = payload.authorId === auth.user?.$id

    // Eigenes Create-Echo, während der eigene POST noch läuft (optimistischer
    // temp-Platzhalter in rows): IGNORIEREN — sonst zählt der Kommentar kurz
    // doppelt (N+2) bis die POST-Response reconciled → sichtbares Flackern.
    // Die POST-Response übernimmt Einfügen + Zählung; kommt sie nicht an,
    // heilt der Rollback/nächste Fetch. Fremde Tabs haben keinen temp → zählen normal.
    if (isOwn && rows.value.some(row => row.$id.startsWith('temp-'))) return

    // Antwort: nur einblenden, wenn der Eltern-Kommentar geladen ist — sonst wäre
    // sie gezählt aber unsichtbar (threaded rendert nur Replies geladener Parents).
    // Nicht geladener Parent (paginiert) → ignorieren, kommt beim nächsten Fetch.
    if (payload.parentId) {
      if (rows.value.some(row => row.$id === payload.parentId)) {
        total.value += 1
        activeTotal.value += 1
        upsertRow(payload)
      }
      // Antwort auf einen noch GEPUFFERTEN Kommentar: mitpuffern statt verwerfen
      // — sonst fehlte sie nach dem Flush der Pill bis zum nächsten Fetch.
      else if (
        pending.value.some(row => row.$id === payload.parentId)
        || pendingReplies.value.some(row => row.$id === payload.parentId)
      ) {
        pendingReplies.value = [...pendingReplies.value, payload]
      }
      return
    }

    // Top-Level: eigenes direkt einblenden, fremdes puffern (Pill)
    if (isOwn) {
      total.value += 1
      activeTotal.value += 1
      upsertRow(payload)
    }
    else {
      pending.value = [payload, ...pending.value]
    }
  }

  return {
    targetId,
    targetType,
    // targetUrl/userReports MÜSSEN mit returned werden: Pinia serialisiert bei
    // Setup-Stores nur returnte Refs in den SSR-Payload — sonst hydratisiert
    // der Client mit leerem targetUrl (Reply-Notification ohne Link) und
    // leerem userReports („Melden" trotz eigener offener Meldung).
    targetUrl,
    userReports,
    rows,
    total,
    activeTotal,
    topLevelTotal,
    userVotes,
    sortMode,
    loading,
    pending,
    pendingCount,
    threaded,
    myVote,
    isReportedByMe,
    setReported,
    fetchComments,
    loadAll,
    setSortMode,
    addComment,
    addGuestComment,
    vote,
    updateComment,
    deleteComment,
    applyRealtime,
    flushPending,
  }
}

/**
 * Ein Store PRO Target (comments:<type>:<id>) statt eines App-Singletons:
 * Seiten mit MEHREREN CommentSections (Community-Feed, Phase 25) brauchen
 * getrennten Zustand — mit einem Singleton „gewinnt" die zuletzt geladene
 * Section und Sortierung/Realtime mischen die Targets. Die Definition wird
 * je Key gecacht (Pinia hält den State ohnehin per Id in der Instanz).
 */
function createDefinition(key: string) {
  return defineStore(key, commentStoreSetup)
}
type CommentStoreDefinition = ReturnType<typeof createDefinition>
const definitions = new Map<string, CommentStoreDefinition>()

export function useCommentStoreFor(targetType: string, targetId: string) {
  const key = `comments:${targetType}:${targetId}`
  let definition = definitions.get(key)
  if (!definition) {
    definition = createDefinition(key)
    definitions.set(key, definition)
  }
  return definition()
}

export type CommentStore = ReturnType<typeof useCommentStoreFor>

/**
 * CommentSection erzeugt den Store und PROVIDED ihn — Kinder (Form/Item/
 * VoteButtons) injecten, statt selbst einen (dann falschen) zu holen.
 */
export const commentStoreKey: InjectionKey<CommentStore> = Symbol('maui-comment-store')
