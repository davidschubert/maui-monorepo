/**
 * DIE DREI RATE-BUDGETS (Konzept § 2.5) — PUR.
 *
 * Alle drei sind JE COMMUNITY. Zwei zählen über den vorhandenen
 * Rate-Limit-Store (`packages/core/server/utils/rateLimitStore.ts`, Redis mit
 * In-Memory-Rückfall, fail-open), das dritte ist eine Abfrage auf die
 * Konversations-Tabelle und braucht keinen Zähler.
 *
 * ── WARUM DER EIGENTLICHE HEBEL DAS ERÖFFNEN IST ──────────────────────────
 * Ein Spammer will VIELE Menschen erreichen, nicht einen Menschen oft. Deshalb
 * ist das schärfste Budget nicht „Nachrichten pro Minute", sondern „offene,
 * unbeantwortete Konversationen": wer fünf Leute angeschrieben hat und von
 * keinem eine Antwort bekam, kann keine sechste eröffnen. Ein Massenversand
 * endet damit nach fünf Empfängern — unabhängig davon, wie geduldig er ist.
 *
 * ── WARUM DIE ZAHLEN HIER STEHEN UND NICHT IN DER MIDDLEWARE ──────────────
 * `core/server/middleware/05.rate-limit.ts` zählt pro IP. Das ist für
 * Anmelde-Versuche richtig und hier falsch: die Budgets gelten je MENSCH und je
 * COMMUNITY, sonst teilen sich ein Verein im gemeinsamen Netz ein Kontingent
 * und ein Angreifer mit zehn Adressen bekommt zehn. Die Middleware bleibt als
 * grober Backstop davor bestehen.
 */

/** Neue Konversationen je Tag — gestaffelt nach Vertrauensstufe (§ 2.5). */
export const NEW_CONVERSATIONS_PER_DAY_TL1 = 10
export const NEW_CONVERSATIONS_PER_DAY_TL2 = 30

/** Nachrichten je Minute (gegen Flooding in einer BESTEHENDEN Konversation). */
export const MESSAGES_PER_MINUTE = 20

/** Offene, unbeantwortete Konversationen (die schärfste und billigste Bremse). */
export const MAX_UNANSWERED_CONVERSATIONS = 5

export const DAY_MS = 24 * 60 * 60 * 1000
export const MINUTE_MS = 60 * 1000

/**
 * Wie viele neue Konversationen darf diese Stufe heute eröffnen?
 *
 * Ab Stufe 2 das größere Budget — wer 15 Tage dabei ist, fünf Inhalte
 * geschrieben und Zustimmung bekommen hat, ist kein Wegwerf-Konto mehr. Unter
 * Stufe 1 steht hier 0, und das ist keine Zahl, sondern die Folge des Gates:
 * eröffnen darf ab TL1 (§ 2.4). Die 0 ist der Gürtel zum Hosenträger.
 */
export function newConversationBudget(trustLevel: number): number {
  if (trustLevel >= 2) return NEW_CONVERSATIONS_PER_DAY_TL2
  if (trustLevel >= 1) return NEW_CONVERSATIONS_PER_DAY_TL1
  return 0
}

/**
 * WELCHE STUFE ZÄHLT FÜRS BUDGET? (Befund aus dem Live-Beweis, 2026-08-05)
 *
 * `messages.write` hat ZWEI Quellen: die Vertrauensstufe (ab TL1) und die
 * ERNENNUNG (Editor, Moderator, Admin, Owner — und im Silo das Betreiber-Label).
 * Das Budget kannte nur die erste. Ein frisch berufener Moderator mit Stufe 0
 * kam damit durch die Tür und lief eine Zeile später in ein Kontingent von
 * NULL: 429 bei der allerersten Nachricht. Ein Recht ohne Kontingent ist kein
 * Recht — der Beweis hat es beim ersten Lauf gefunden, kein Test hätte es
 * gesehen, weil beide Hälften für sich richtig waren.
 *
 * Die Regel: wer NICHT über die Stufe hereinkommt, hat mindestens das
 * TL1-Budget. Nicht mehr — eine Ernennung ist eine Vertrauensaussage, kein
 * Freibrief; wer viel schreiben will, sammelt dieselbe Stufe wie alle anderen.
 *
 * `via` ist die Auskunft von `requireCommunityPermission` (core/shared/
 * communityAccess.ts): 'trust' = über die Stufe, alles andere = Rolle,
 * Operator-Break-Glass oder Silo-Label.
 */
export function effectiveOpenerLevel(trustLevel: number, via: string): number {
  if (via === 'trust') return trustLevel
  return Math.max(trustLevel, 1)
}

/**
 * Der Schlüssel eines Budgets im geteilten Store.
 *
 * MANDANT UND MENSCH GEHÖREN BEIDE HINEIN. Ohne die Community teilte sich
 * jemand, der in drei Communities aktiv ist, EIN Kontingent — die Bremse
 * träfe dann die zweite Community für das Verhalten in der ersten. Ohne den
 * Menschen wäre es ein Community-Budget, und ein einziger Spammer legte alle
 * still.
 */
export function budgetKey(kind: 'open' | 'send', communityId: string, userId: string): string {
  return `msg:${kind}:${communityId}:${userId}`
}

/**
 * Ist das Budget mit DIESEM Versuch überschritten?
 *
 * `count` ist der Stand NACH dem Zählen (`store.hit`) — dieselbe Semantik wie
 * in der Rate-Limit-Middleware, damit hier und dort dasselbe „der (max+1)-te
 * blockt" gilt.
 */
export function budgetExceeded(count: number, max: number): boolean {
  return count > max
}

/** Darf noch eine unbeantwortete Konversation dazukommen? */
export function mayOpenAnotherConversation(unansweredCount: number): boolean {
  return unansweredCount < MAX_UNANSWERED_CONVERSATIONS
}
