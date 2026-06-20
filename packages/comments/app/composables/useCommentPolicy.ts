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
export function provideCommentPolicy() {
  const flags = useRuntimeFlags()
  const data = flags.data
  // Eigenes Objekt zurückgeben: inject() im selben Setup würde sonst den
  // Fallback treffen, nicht das eigene provide(). CommentSection nutzt `policy`
  // direkt, Kind-Komponenten lesen es via useCommentPolicy()/inject.
  const policy: CommentPolicy = {
    canWrite: computed(() => data.value.commentsEnabled && !data.value.maintenanceMode),
    canDelete: computed(() => !data.value.maintenanceMode),
    reason: computed(() => data.value.maintenanceMode
      ? 'maintenance'
      : (!data.value.commentsEnabled ? 'disabled' : null)),
  }
  provide(commentPolicyKey, policy)
  return { policy, flags }
}

/** Policy aus dem Provider; Fallback = alles erlaubt (Standalone-Nutzung). */
export function useCommentPolicy(): CommentPolicy {
  return inject(commentPolicyKey, {
    canWrite: computed(() => true),
    canDelete: computed(() => true),
    reason: computed(() => null),
  })
}
