import type { ComputedRef, InjectionKey } from 'vue'

export interface CommentPolicy {
  /** Erstellen, Antworten, Bearbeiten, Voten, Melden erlaubt */
  canWrite: ComputedRef<boolean>
  /** Eigene Kommentare löschen erlaubt (nur im Wartungsmodus gesperrt) */
  canDelete: ComputedRef<boolean>
  /** Grund der Sperre für die UI-Meldung */
  reason: ComputedRef<'maintenance' | 'disabled' | null>
}

export const commentPolicyKey: InjectionKey<CommentPolicy> = Symbol('comment-policy')

/**
 * Liest die Laufzeit-Flags und stellt die Kommentar-Policy per provide bereit.
 * In CommentSection (synchron, vor dem ersten await) aufrufen; das
 * zurückgegebene AsyncData danach für SSR awaiten.
 */
export function provideCommentPolicy(): CommentPolicy {
  const flags = useRuntimeFlags()
  // Eigenes Objekt zurückgeben: inject() im selben Setup würde sonst den
  // Fallback treffen, nicht das eigene provide(). CommentSection nutzt das
  // Ergebnis direkt, Kind-Komponenten lesen es via useCommentPolicy()/inject.
  const policy: CommentPolicy = {
    canWrite: computed(() => flags.value.commentsEnabled && !flags.value.maintenanceMode),
    canDelete: computed(() => !flags.value.maintenanceMode),
    reason: computed(() => flags.value.maintenanceMode
      ? 'maintenance'
      : (!flags.value.commentsEnabled ? 'disabled' : null)),
  }
  provide(commentPolicyKey, policy)
  return policy
}

/** Policy aus dem Provider; Fallback = alles erlaubt (Standalone-Nutzung). */
export function useCommentPolicy(): CommentPolicy {
  return inject(commentPolicyKey, {
    canWrite: computed(() => true),
    canDelete: computed(() => true),
    reason: computed(() => null),
  })
}
