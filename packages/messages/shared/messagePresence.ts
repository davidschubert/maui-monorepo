/**
 * „TIPPT GERADE" — UND DAS LECK, DAS MAN NICHT ÜBERSEHEN DARF (Konzept § 4).
 *
 * ── DER BEFUND ────────────────────────────────────────────────────────────
 * Presence-Zeilen tragen seit A4/2026-07-29 `read("label:<communityId>")`
 * (`core/shared/presencePermissions.ts`) — JEDES Mitglied der Community kann
 * JEDE Presence lesen. Setzt man den Scope naiv auf `dm:<conversationId>`,
 * sehen zwei gleichzeitig gesetzte, IDENTISCHE Scope-Werte für Dritte so aus:
 * „A und B reden gerade miteinander." Das ist eine Metadaten-Preisgabe, die
 * dieses Produkt an anderer Stelle sorgfältig vermeidet.
 *
 * ── DIE MILDERUNG, EHRLICH BENANNT ────────────────────────────────────────
 * Der Scope trägt zusätzlich den EMPFÄNGER. Damit sind die Werte der beiden
 * Seiten VERSCHIEDEN (`dm:<id>:<b>` vs. `dm:<id>:<a>`), und wer korrelieren
 * will, muss die Konversations-Id UND das Gegenüber schon kennen.
 *
 * DAS IST EINE HÜRDE, KEINE WAND — und der Satz gehört hierher und nicht in
 * ein Nebenprotokoll: wer die Konversations-Id kennt (etwa weil er selbst
 * beteiligt war), kann aus zwei Presence-Zeilen weiterhin schließen, dass
 * dort gerade jemand tippt. Wem das nicht reicht, schaltet „tippt gerade"
 * ab — die Anzeige hängt an genau dieser einen Funktion, und ohne sie wird
 * kein Scope gesetzt.
 *
 * Der Scope wird BEWUSST nicht gehasht: ein Hash sähe nach Schutz aus, wäre
 * aber gegen denselben Angreifer (der beide Ids kennt) genauso wirkungslos —
 * und er nähme uns die Lesbarkeit beim Debuggen. Lieber eine benannte Hürde
 * als eine geheim aussehende.
 */

/** Der Presence-Scope für „ich tippe in dieser Konversation an diese Person". */
export function messageTypingScope(conversationId: string, recipientId: string): string {
  return `dm:${conversationId}:${recipientId}`
}

/**
 * Der Scope, auf den ICH horche, um zu sehen, dass das GEGENÜBER tippt.
 *
 * Es ist der gespiegelte Wert: der andere setzt mich als Empfänger. Genau
 * diese Spiegelung ist der Grund, warum die beiden Werte verschieden sind.
 */
export function partnerTypingScope(conversationId: string, myUserId: string): string {
  return messageTypingScope(conversationId, myUserId)
}
