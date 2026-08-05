import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  MAX_UNANSWERED_CONVERSATIONS,
  MESSAGES_PER_MINUTE,
  MINUTE_MS,
  NEW_CONVERSATIONS_PER_DAY_TL1,
  NEW_CONVERSATIONS_PER_DAY_TL2,
  budgetExceeded,
  budgetKey,
  effectiveOpenerLevel,
  mayOpenAnotherConversation,
  newConversationBudget,
} from '../shared/messageBudgets'

/**
 * DIE DREI RATE-BUDGETS (Konzept § 2.5).
 *
 * Der Punkt, den diese Tests festhalten: der eigentliche Spam-Hebel ist das
 * ERÖFFNEN, nicht das Schreiben — und das schärfste Budget ist deshalb die
 * Zahl der offenen, unbeantworteten Konversationen. Ein Massenversand endet
 * damit nach fünf Empfängern, egal wie geduldig er ist.
 */
describe('Konzept-Zahlen', () => {
  it('steht so da wie im Konzept', () => {
    expect(NEW_CONVERSATIONS_PER_DAY_TL1).toBe(10)
    expect(NEW_CONVERSATIONS_PER_DAY_TL2).toBe(30)
    expect(MESSAGES_PER_MINUTE).toBe(20)
    expect(MAX_UNANSWERED_CONVERSATIONS).toBe(5)
    expect(DAY_MS).toBe(86_400_000)
    expect(MINUTE_MS).toBe(60_000)
  })
})

describe('Tages-Budget nach Vertrauensstufe', () => {
  it('gibt Stufe 0 GAR NICHTS', () => {
    // Der Gürtel zum Hosenträger: eröffnen darf ohnehin erst ab TL1
    // (`messages.write`). Eine 0 hier heißt, dass auch ein Fehler an der Tür
    // nicht in ein Budget läuft.
    expect(newConversationBudget(0)).toBe(0)
  })

  it('staffelt ab Stufe 1 und ab Stufe 2', () => {
    expect(newConversationBudget(1)).toBe(NEW_CONVERSATIONS_PER_DAY_TL1)
    expect(newConversationBudget(2)).toBe(NEW_CONVERSATIONS_PER_DAY_TL2)
    expect(newConversationBudget(4)).toBe(NEW_CONVERSATIONS_PER_DAY_TL2)
  })
})

describe('welche Stufe fürs Budget zählt (Live-Befund 2026-08-05)', () => {
  it('gibt einem ERNANNTEN mindestens das TL1-Budget', () => {
    /**
     * Der Fehler, den der Beweis gefunden hat: `messages.write` hat zwei
     * Quellen (Stufe UND Ernennung), das Budget kannte nur die erste. Ein
     * frisch berufener Moderator mit Stufe 0 kam durch die Tür und lief eine
     * Zeile später in ein Kontingent von NULL — 429 bei der allerersten
     * Nachricht. Beide Hälften waren für sich richtig; kein Unit-Test hätte
     * das gesehen.
     */
    expect(effectiveOpenerLevel(0, 'role')).toBe(1)
    expect(effectiveOpenerLevel(0, 'operator')).toBe(1)
    expect(effectiveOpenerLevel(0, 'single-tenant')).toBe(1)
    expect(newConversationBudget(effectiveOpenerLevel(0, 'role'))).toBe(NEW_CONVERSATIONS_PER_DAY_TL1)
  })

  it('nimmt einer HÖHEREN Stufe nichts weg', () => {
    expect(effectiveOpenerLevel(3, 'role')).toBe(3)
  })

  it('lässt die Stufe für sich sprechen, wenn sie die Quelle IST', () => {
    // Kommt das Recht aus der Stufe, gilt genau sie — sonst bekäme eine
    // Stufe 0 über den Umweg „via: trust" ein Budget, das sie nicht hat.
    expect(effectiveOpenerLevel(0, 'trust')).toBe(0)
    expect(effectiveOpenerLevel(2, 'trust')).toBe(2)
  })
})

describe('Schlüssel', () => {
  it('trennt nach Community UND Mensch', () => {
    // Ohne die Community teilte sich jemand mit drei Mitgliedschaften EIN
    // Kontingent; ohne den Menschen legte ein einziger Spammer alle still.
    expect(budgetKey('open', 'c1', 'u1')).not.toBe(budgetKey('open', 'c2', 'u1'))
    expect(budgetKey('open', 'c1', 'u1')).not.toBe(budgetKey('open', 'c1', 'u2'))
    expect(budgetKey('open', 'c1', 'u1')).not.toBe(budgetKey('send', 'c1', 'u1'))
  })
})

describe('Überschreitung', () => {
  it('blockt den (max+1)-ten Versuch — wie die Rate-Limit-Middleware', () => {
    expect(budgetExceeded(10, 10)).toBe(false)
    expect(budgetExceeded(11, 10)).toBe(true)
  })
})

describe('offene, unbeantwortete Konversationen', () => {
  it('lässt bis fünf zu und stoppt bei der sechsten', () => {
    expect(mayOpenAnotherConversation(0)).toBe(true)
    expect(mayOpenAnotherConversation(4)).toBe(true)
    expect(mayOpenAnotherConversation(5)).toBe(false)
    expect(mayOpenAnotherConversation(9)).toBe(false)
  })
})
