import { describe, expect, it } from 'vitest'
import {
  MESSAGE_NOTIFICATION_TYPE,
  messageNotificationFields,
  messageNotificationKey,
  messageNotificationLink,
} from '../shared/messageNotification'
import { messageTypingScope, partnerTypingScope } from '../shared/messagePresence'

/**
 * DIE BENACHRICHTIGUNG (Konzept § 4).
 *
 * Zwei Zusagen:
 *  1. ZUSAMMENFASSEN STATT FLUTEN — je Konversation eine Meldung, solange die
 *     vorige ungelesen ist. Umgesetzt über den Idempotenz-Schlüssel von
 *     `notify()` (409 ⇒ keine Zeile UND keine Mail), nicht über „erst
 *     nachsehen, dann schreiben".
 *  2. DIE MAIL TRÄGT DEN NACHRICHTENTEXT NICHT. Das Postfach ist ein dritter
 *     Ort, an dem der Inhalt landet, und dieser Ort ist nicht der, den der
 *     Absender gewählt hat.
 */
describe('Idempotenz-Schlüssel', () => {
  const base = { conversationId: 'conv1', recipientId: 'anna', readRounds: 0 }

  it('bleibt gleich, solange nicht gelesen wurde', () => {
    expect(messageNotificationKey(base)).toBe(messageNotificationKey({ ...base }))
  })

  it('ändert sich, sobald der Empfänger gelesen hat', () => {
    expect(messageNotificationKey({ ...base, readRounds: 1 })).not.toBe(messageNotificationKey(base))
  })

  it('trennt Empfänger und Konversationen', () => {
    expect(messageNotificationKey({ ...base, recipientId: 'bodo' })).not.toBe(messageNotificationKey(base))
    expect(messageNotificationKey({ ...base, conversationId: 'conv2' })).not.toBe(messageNotificationKey(base))
  })

  it('passt in eine Appwrite-Row-Id', () => {
    // Höchstens 36 Zeichen, und das erste darf kein Unterstrich sein.
    const key = messageNotificationKey({ conversationId: 'a'.repeat(36), recipientId: 'b'.repeat(36), readRounds: 999 })
    expect(key.length).toBeLessThanOrEqual(36)
    expect(key.startsWith('_')).toBe(false)
    expect(key).toMatch(/^[a-zA-Z][a-zA-Z0-9._-]*$/)
  })

  it('verträgt kaputte Zählmarken, ohne den Schlüssel zu zerlegen', () => {
    expect(messageNotificationKey({ ...base, readRounds: -3 })).toBe(messageNotificationKey({ ...base, readRounds: 0 }))
    expect(messageNotificationKey({ ...base, readRounds: 1.7 })).toBe(messageNotificationKey({ ...base, readRounds: 1 }))
  })
})

describe('Typ und Link', () => {
  it('trägt einen eigenen Typ (Glocken-Zweig + de/en sind Pflicht, C17)', () => {
    expect(MESSAGE_NOTIFICATION_TYPE).toBe('message.received')
  })

  it('führt in den EINEN Lese-Ort mit vorgewählter Konversation', () => {
    expect(messageNotificationLink('conv1')).toBe('/dashboard/messages?c=conv1')
  })

  it('kodiert die Id — ein Link ist kein Vertrauensbeweis', () => {
    expect(messageNotificationLink('a b&c')).toBe('/dashboard/messages?c=a%20b%26c')
  })
})

describe('die Mail trägt den Text NICHT', () => {
  it('setzt den Absendernamen als Titel und lässt den Rumpf leer', () => {
    expect(messageNotificationFields('Anna')).toEqual({ title: 'Anna', body: '' })
  })
})

describe('Presence-Scope: die Milderung gegen das Leck (§ 4)', () => {
  it('macht die Werte der beiden Seiten VERSCHIEDEN', () => {
    // Ohne den Empfänger im Scope sähen zwei identische Werte für jedes
    // Mitglied der Community so aus: „A und B reden gerade miteinander."
    expect(messageTypingScope('conv1', 'anna')).not.toBe(messageTypingScope('conv1', 'bodo'))
  })

  it('spiegelt sich: worauf ich horche, setzt das Gegenüber', () => {
    // Anna hört auf den Scope, den Bodo setzt, wenn er IHR schreibt.
    expect(partnerTypingScope('conv1', 'anna')).toBe(messageTypingScope('conv1', 'anna'))
  })
})
