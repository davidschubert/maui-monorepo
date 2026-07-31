import type { FeedbackArea, FeedbackComment, FeedbackEntry, FeedbackState, FeedbackVisibility } from '../../../control/shared/customerFeedback'

export interface FeedbackListResponse {
  total: number
  entries: FeedbackEntry[]
  operator: boolean
  /** false = control antwortet nicht / ist nicht konfiguriert. */
  available: boolean
}

export interface FeedbackUpdatePatch {
  state?: FeedbackState
  status?: FeedbackVisibility
  title?: string
  area?: FeedbackArea
  productKey?: string
}

/**
 * Die Schreib-Aktionen des Feedback-Bereichs an EINER Stelle — Liste und
 * Roadmap zeigen dieselben Einträge, also sollen sie sie auch gleich
 * behandeln (wählen, kommentieren, verschieben).
 *
 * Jede Aktion geht an den EIGENEN Server (Entscheidung 1); der reicht sie über
 * die Service-Naht weiter. Es gibt bewusst KEIN Live-Morphen über Realtime —
 * Stimmen und Kommentare erscheinen beim nächsten Laden, nicht sofort bei
 * allen. Deshalb aktualisieren die Aktionen hier den lokalen Eintrag direkt:
 * der Klickende sieht seine eigene Wirkung, ohne die ganze Liste neu zu holen.
 */
export function useCustomerFeedback() {
  const { t } = useI18n()
  const toast = useToast()

  function fail(error: unknown) {
    const reason = (error as { data?: { reason?: string } }).data?.reason
    const status = (error as { statusCode?: number }).statusCode
    toast.add({
      title: reason === 'anonymous' || status === 401
        ? t('feedback.list.loginRequired')
        : t('feedback.list.actionFailed'),
      color: 'error',
    })
  }

  /** Stimme umschalten. Der Eintrag wird an Ort und Stelle nachgezogen. */
  async function toggleVote(entry: FeedbackEntry): Promise<boolean> {
    try {
      const result = await $fetch<{ voted: boolean, voteCount: number, communityCount: number }>(
        `/api/feedback/${entry.id}/vote`, { method: 'POST' },
      )
      entry.hasVoted = result.voted
      entry.voteCount = result.voteCount
      entry.communityCount = result.communityCount
      return true
    }
    catch (error) {
      fail(error)
      return false
    }
  }

  async function loadComments(feedbackId: string): Promise<FeedbackComment[]> {
    try {
      const result = await $fetch<{ comments: FeedbackComment[] }>(`/api/feedback/${feedbackId}/comments`)
      return result.comments
    }
    catch (error) {
      fail(error)
      return []
    }
  }

  async function addComment(entry: FeedbackEntry, body: string): Promise<boolean> {
    try {
      const result = await $fetch<{ id: string, commentCount: number }>(
        `/api/feedback/${entry.id}/comments`, { method: 'POST', body: { body } },
      )
      entry.commentCount = result.commentCount
      return true
    }
    catch (error) {
      fail(error)
      return false
    }
  }

  /** Betreiber: Zustand verschieben oder verstecken/wieder zeigen. */
  async function updateEntry(entry: FeedbackEntry, patch: FeedbackUpdatePatch): Promise<boolean> {
    try {
      await $fetch(`/api/feedback/${entry.id}`, { method: 'PATCH', body: patch })
      Object.assign(entry, patch)
      return true
    }
    catch (error) {
      fail(error)
      return false
    }
  }

  /** Betreiber: Notbremse — eine einzelne Community stummschalten. */
  async function muteCommunity(communityId: string, communityName: string, muted: boolean): Promise<boolean> {
    try {
      await $fetch('/api/feedback/mute', { method: 'POST', body: { communityId, communityName, muted } })
      toast.add({
        title: muted ? t('feedback.admin.muted') : t('feedback.admin.unmuted'),
        color: 'success',
      })
      return true
    }
    catch (error) {
      fail(error)
      return false
    }
  }

  return { toggleVote, loadComments, addComment, updateEntry, muteCommunity }
}
