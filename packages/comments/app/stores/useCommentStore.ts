import { defineStore } from 'pinia'
import type {
  Comment,
  CommentListResponse,
  CommentNode,
  SortMode,
  VoteResponse,
  VoteValue,
} from '../../shared/types/comment'

/** Strukturkompatibel zu RealtimeRowEvent<Comment> aus dem Core */
interface RealtimeCommentEvent {
  type: 'create' | 'update' | 'delete'
  payload: Comment
  events: string[]
}

export const useCommentStore = defineStore('comments', () => {
  const targetId = ref('')
  const targetType = ref('')
  const rows = ref<Comment[]>([])
  const total = ref(0)
  const userVotes = ref<Record<string, VoteValue>>({})
  const sortMode = ref<SortMode>('new')
  const loading = ref(false)
  /** Per Realtime eingetroffene fremde Top-Level-Kommentare, gepuffert für die "N neue"-Pill */
  const pending = ref<Comment[]>([])
  const pendingCount = computed(() => pending.value.length)
  /** IDs, die wir per Moderation (hidden) entfernt haben — für Live-Restore */
  const removedByHide = new Set<string>()

  /** Baum aus der flachen Liste: Top-Level behält die Server-Sortierung, Antworten chronologisch */
  const threaded = computed<CommentNode[]>(() => {
    const children = new Map<string, Comment[]>()
    for (const row of rows.value) {
      if (!row.parentId) continue
      const list = children.get(row.parentId) ?? []
      list.push(row)
      children.set(row.parentId, list)
    }

    const toNode = (comment: Comment): CommentNode => ({
      comment,
      children: (children.get(comment.$id) ?? [])
        .slice()
        .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))
        .map(toNode),
    })

    return rows.value.filter(row => !row.parentId).map(toNode)
  })

  function myVote(commentId: string): VoteValue | null {
    return userVotes.value[commentId] ?? null
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

  async function fetchComments(id: string, type: string) {
    targetId.value = id
    targetType.value = type
    loading.value = true
    try {
      const response = await $fetch<CommentListResponse>('/api/comments', {
        query: { targetId: id, targetType: type, sort: sortMode.value },
      })
      rows.value = response.rows
      total.value = response.total
      userVotes.value = response.myVotes
      pending.value = []
      removedByHide.clear()
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
      upvotes: 0,
      downvotes: 0,
      score: 0,
      status: 'active',
    }
    rows.value = [temp, ...rows.value]
    total.value += 1

    try {
      const created = await $fetch<Comment>('/api/comments', {
        method: 'POST',
        body: { targetId: targetId.value, targetType: targetType.value, content, parentId },
      })
      // Realtime kann denselben Kommentar parallel schon eingefügt haben (Race
      // zwischen POST-Response und Create-Event). Idempotent abgleichen statt
      // blind temp→created zu mappen, sonst entsteht ein Duplikat.
      const alreadyPresent = rows.value.some(row => row.$id === created.$id)
      rows.value = rows.value.filter(row => row.$id !== temp.$id)
      if (alreadyPresent) total.value -= 1 // Realtime hat bereits gezählt
      upsertRow(created)
      return created
    }
    catch (error) {
      // Rollback: optimistisch eingefügten Kommentar wieder entfernen
      rows.value = rows.value.filter(row => row.$id !== temp.$id)
      total.value -= 1
      throw error
    }
  }

  /** Optimistic: Zähler + eigener Vote sofort, Server-Stand reconciled, Rollback bei Fehler */
  async function vote(commentId: string, value: VoteValue) {
    const index = rows.value.findIndex(row => row.$id === commentId)
    if (index === -1) return

    const snapshotRow = { ...rows.value[index]! }
    const snapshotVote = userVotes.value[commentId] ?? null
    const next: VoteValue | null = snapshotVote === value ? null : value

    const optimistic = { ...snapshotRow }
    if (snapshotVote === 1) optimistic.upvotes -= 1
    if (snapshotVote === -1) optimistic.downvotes -= 1
    if (next === 1) optimistic.upvotes += 1
    if (next === -1) optimistic.downvotes += 1
    optimistic.score = optimistic.upvotes - optimistic.downvotes

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

  async function report(commentId: string) {
    await $fetch(`/api/comments/${commentId}/report`, { method: 'POST' })
    const row = rows.value.find(r => r.$id === commentId)
    if (row) upsertRow({ ...row, status: 'reported' })
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
    const merged = comment.authorAvatarUrl === undefined && prev.authorAvatarUrl !== undefined
      ? { ...comment, authorAvatarUrl: prev.authorAvatarUrl }
      : comment
    rows.value.splice(index, 1, merged)
  }

  /** Entfernt eine Row (aus Liste + Puffer); zählt total optional runter */
  function removeRow(id: string, decrement = false) {
    const wasVisible = rows.value.some(row => row.$id === id)
    if (wasVisible) rows.value = rows.value.filter(row => row.$id !== id)
    pending.value = pending.value.filter(row => row.$id !== id)
    if (decrement && wasVisible) total.value = Math.max(0, total.value - 1)
  }

  /** Gepufferte (fremde) Kommentare auf einen Klick in die Liste übernehmen */
  function flushPending() {
    if (!pending.value.length) return
    rows.value = [...pending.value, ...rows.value]
    total.value += pending.value.length
    pending.value = []
  }

  /** Realtime: gezieltes Einfügen/Aktualisieren — kein Full-Refresh */
  function applyRealtime(event: RealtimeCommentEvent) {
    const { type, payload } = event

    if (type === 'delete') {
      removeRow(payload.$id, true)
      return
    }

    if (type === 'update') {
      // Moderation: ausgeblendete Kommentare live entfernen (GET filtert hidden ohnehin)
      if (payload.status === 'hidden') { removeRow(payload.$id, true); removedByHide.add(payload.$id); return }
      // bereits sichtbar → aktualisieren (Edit, Vote-Score, Report-Badge, Soft-Delete)
      if (rows.value.some(row => row.$id === payload.$id)) { upsertRow(payload); return }
      // nicht (mehr) sichtbar: nur wieder aufnehmen, wenn WIR es per hide entfernt
      // haben und es jetzt wieder sichtbar ist (Restore) — sonst ignorieren, damit
      // Votes/Edits an nicht geladenen (paginierten) Kommentaren nichts einblenden
      if (removedByHide.has(payload.$id) && (payload.status === 'active' || payload.status === 'reported')) {
        removedByHide.delete(payload.$id)
        total.value += 1
        upsertRow(payload)
      }
      return
    }

    // create — Duplikate (eigener optimistischer Kommentar, Echo) ignorieren
    if (rows.value.some(row => row.$id === payload.$id) || pending.value.some(row => row.$id === payload.$id)) return

    const auth = useAuthStore()
    const isOwn = payload.authorId === auth.user?.$id
    // Antworten erscheinen direkt im Thread; fremde Top-Level werden gepuffert (Pill)
    if (payload.parentId || isOwn) {
      total.value += 1
      upsertRow(payload)
    }
    else {
      pending.value = [payload, ...pending.value]
    }
  }

  return {
    targetId,
    targetType,
    rows,
    total,
    userVotes,
    sortMode,
    loading,
    pending,
    pendingCount,
    threaded,
    myVote,
    fetchComments,
    setSortMode,
    addComment,
    vote,
    updateComment,
    deleteComment,
    report,
    applyRealtime,
    flushPending,
  }
})
