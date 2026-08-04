import type { ComputedRef, InjectionKey } from 'vue'

export interface CommentPolicy {
  /** Erstellen, Antworten, Bearbeiten, Voten, Melden erlaubt */
  canWrite: ComputedRef<boolean>
  /** Eigene Kommentare löschen erlaubt (nur im Wartungsmodus gesperrt) */
  canDelete: ComputedRef<boolean>
  /** Grund der Sperre für die UI-Meldung */
  reason: ComputedRef<'maintenance' | 'disabled' | 'locked' | null>
}

/**
 * `locked` = DIESES EINE Ziel nimmt keine neuen Kommentare an — im Gegensatz zu
 * den beiden anderen Gründen, die für die ganze Instanz gelten.
 *
 * BEWUSST INHALTSLEER: warum ein Ziel zu ist, weiß dieser Layer nicht und soll
 * es nicht wissen (A14). Heute setzt es die Discussions-Seite, wenn ein Thema
 * geschlossen ist; morgen kann es ein Kurs oder ein Termin sein. Der Layer
 * kennt nur die Tatsache, und der Text dazu ist entsprechend allgemein
 * formuliert.
 *
 * Es ist eine ANZEIGE-Regel, keine Durchsetzung: die liegt serverseitig im
 * Core-Vertrag `assertContentWritable` und gilt auch für jemanden, der die
 * Oberfläche umgeht.
 */
export interface CommentPolicyOptions {
  /** Getter statt Wert: das Ziel kann sich ohne Seitenwechsel ändern
   *  (Moderator schließt das Thema, die offene Seite zieht nach). */
  locked?: () => boolean
}

export const commentPolicyKey: InjectionKey<CommentPolicy> = Symbol('comment-policy')

/**
 * Liest die Laufzeit-Flags und stellt die Kommentar-Policy per provide bereit.
 * In CommentSection (synchron, vor dem ersten await) aufrufen; das
 * zurückgegebene AsyncData danach für SSR awaiten.
 */
export function provideCommentPolicy(options: CommentPolicyOptions = {}): CommentPolicy {
  const flags = useRuntimeFlags()
  const locked = () => options.locked?.() ?? false
  // Eigenes Objekt zurückgeben: inject() im selben Setup würde sonst den
  // Fallback treffen, nicht das eigene provide(). CommentSection nutzt das
  // Ergebnis direkt, Kind-Komponenten lesen es via useCommentPolicy()/inject.
  const policy: CommentPolicy = {
    canWrite: computed(() => flags.value.commentsEnabled && !flags.value.maintenanceMode && !locked()),
    /**
     * LÖSCHEN BLEIBT ERLAUBT, auch wenn das Ziel zu ist. „Geschlossen" heißt
     * „keine neuen Beiträge", nicht „deine alten sind jetzt in Stein" — wer
     * seinen eigenen Kommentar zurückziehen will, darf das weiterhin
     * (dieselbe Linie, aus der `canDelete` schon den `disabled`-Fall
     * überlebt: nur der Wartungsmodus friert wirklich alles ein).
     */
    canDelete: computed(() => !flags.value.maintenanceMode),
    // Reihenfolge = Reichweite: was für die ganze Instanz gilt, wiegt schwerer
    // als die Sperre eines einzelnen Ziels und wird zuerst genannt.
    reason: computed(() => flags.value.maintenanceMode
      ? 'maintenance'
      : (!flags.value.commentsEnabled ? 'disabled' : (locked() ? 'locked' : null))),
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
