import type { Ref } from 'vue'
import { messageTypingScope, partnerTypingScope } from '../../shared/messagePresence'

/**
 * „TIPPT GERADE" in einer privaten Konversation — auf der bestehenden
 * Presence, MIT der Milderung aus Konzept § 4.
 *
 * ── WARUM NICHT `useThreadPresence` ──────────────────────────────────────
 * Das ist die Kommentar-Variante desselben Gedankens und liegt im
 * comments-Layer; ein Produkt-Layer importiert keinen anderen (A14). Gemeinsam
 * ist die Grundlage, nicht der Einstieg — genau Davids Regel „geteilt wird der
 * MECHANISMUS, nie der Einstieg". Der Mechanismus (`usePresenceState`,
 * `usePresence`) liegt in core und wird hier ein zweites Mal benutzt, nicht
 * kopiert.
 *
 * ── DER SCOPE TRÄGT DEN EMPFÄNGER (die Milderung) ───────────────────────
 * Presence-Zeilen sind für JEDES Mitglied der Community lesbar (A4). Ein
 * naiver Scope `dm:<id>` sähe für Dritte so aus: „A und B reden gerade
 * miteinander." Mit dem Empfänger im Scope sind die Werte der beiden Seiten
 * verschieden — eine Hürde, keine Wand. Die vollständige Begründung samt
 * Rest-Risiko steht in `shared/messagePresence.ts`.
 */
const TYPING_RESET_MS = 3_000

export function useMessageTyping(conversationId: Ref<string>, partnerId: Ref<string>) {
  const state = usePresenceState()
  const { user } = useCurrentUser()

  /** Was ICH setze, wenn ich tippe. */
  const myScope = computed(() =>
    conversationId.value && partnerId.value ? messageTypingScope(conversationId.value, partnerId.value) : '')

  /** Was das GEGENÜBER setzt, wenn es mir schreibt (der gespiegelte Wert). */
  const listenScope = computed(() =>
    conversationId.value && user.value?.$id ? partnerTypingScope(conversationId.value, user.value.$id) : '')

  const live = usePresence(u => !!listenScope.value && u.scope === listenScope.value && u.typing)
  const partnerTyping = computed(() => live.present.value.some(u => u.userId !== user.value?.$id))

  // Der Scope folgt der geöffneten Konversation. Beim Verlassen wird er
  // GELÖSCHT — sonst stünde in meiner Presence weiter, mit wem ich zuletzt
  // gesprochen habe, und genau das soll dort nicht dauerhaft stehen.
  watch(myScope, (value) => {
    state.setScope(value || undefined)
    if (!value) state.setTyping(false)
  }, { immediate: true })

  onScopeDispose(() => {
    state.setTyping(false)
    state.setScope(undefined)
  })

  let reset: ReturnType<typeof setTimeout> | undefined
  function setTyping(active: boolean) {
    state.setTyping(active)
    clearTimeout(reset)
    // Auto-Reset nach drei Sekunden ohne Tastenschlag — dasselbe Fenster wie
    // im Kommentar-Thread, damit sich das Produkt überall gleich anfühlt.
    if (active) reset = setTimeout(() => state.setTyping(false), TYPING_RESET_MS)
  }

  return { partnerTyping, setTyping }
}
