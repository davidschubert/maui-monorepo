import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_PARTICIPANTS_V1,
  conversationIsAbandoned,
  conversationPairKey,
  counterValue,
  isParticipant,
  isValidParticipantSet,
  memberAfterMessage,
  messagePreview,
  normalizeParticipants,
  otherParticipant,
} from '../shared/conversations'
import { MESSAGE_PREVIEW_LENGTH } from '../shared/types/message'

/**
 * DIE PUREN REGELN EINER KONVERSATION.
 *
 * Zwei Zusagen hängen daran, und beide werden hier festgenagelt:
 *  1. „n:m-fähig gebaut, 1:1 ausgeliefert" (Davids Entscheidung 6) — die
 *     Beschränkung steht an EINER Stelle und nicht im Datenbank-Schema.
 *  2. „A schreibt B" und „B schreibt A" ergeben DIESELBE Konversation. Ohne
 *     das läse jeder seine eigene Hälfte, und niemand merkte es.
 */
describe('Teilnehmer', () => {
  it('normalisiert sortiert, ohne Doubletten und ohne Leerwerte', () => {
    expect(normalizeParticipants(['b', 'a', 'b', '', null, undefined])).toEqual(['a', 'b'])
  })

  it('erzeugt für beide Richtungen denselben Schlüssel', () => {
    expect(conversationPairKey(['userB', 'userA'])).toBe(conversationPairKey(['userA', 'userB']))
    expect(conversationPairKey(['userA', 'userB'])).toBe('userA:userB')
  })

  it('lässt v1 GENAU zwei zu — nicht einen, nicht drei', () => {
    expect(CONVERSATION_PARTICIPANTS_V1).toBe(2)
    expect(isValidParticipantSet(['a', 'b'])).toBe(true)
    expect(isValidParticipantSet(['a'])).toBe(false)
    expect(isValidParticipantSet(['a', 'b', 'c'])).toBe(false)
    // Sich selbst anschreiben ist kein gültiges Paar (Doublette fällt weg).
    expect(isValidParticipantSet(['a', 'a'])).toBe(false)
  })

  it('findet das Gegenüber und erkennt Fremde', () => {
    expect(otherParticipant(['a', 'b'], 'a')).toBe('b')
    expect(otherParticipant(['a', 'b'], 'fremd')).toBe('a')
    expect(isParticipant(['a', 'b'], 'b')).toBe(true)
    expect(isParticipant(['a', 'b'], 'c')).toBe(false)
  })
})

describe('Zähler', () => {
  it('liest alles Unbrauchbare als 0', () => {
    // Bestandszeilen und Teilfehler dürfen keine NaN durch die Anzeige ziehen —
    // dieselbe fail-soft-Richtung wie bei `normalizeTrustLevel`.
    for (const value of [undefined, null, Number.NaN, -3, 'zwei', {}]) {
      expect(counterValue(value), String(value)).toBe(0)
    }
  })

  it('schneidet Nachkommastellen ab, statt sie zu runden', () => {
    expect(counterValue(3)).toBe(3)
    expect(counterValue(3.9)).toBe(3)
  })
})

describe('Vorschau', () => {
  it('macht aus Umbrüchen Leerzeichen', () => {
    expect(messagePreview('Hallo\n\nWelt   ')).toBe('Hallo Welt')
  })

  it('kürzt hart auf die Spaltenbreite', () => {
    const preview = messagePreview('x'.repeat(500))
    expect(preview.length).toBe(MESSAGE_PREVIEW_LENGTH)
    expect(preview.endsWith('…')).toBe(true)
  })
})

describe('Für mich entfernen (Davids Entscheidung 5)', () => {
  it('holt den Verlauf beim nächsten Schreiben zurück', () => {
    // Sonst wäre „ich räume auf" dasselbe wie „ich schweige diese Person tot" —
    // der Absender bekäme keinen Hinweis, dass nichts ankommt.
    expect(memberAfterMessage(true)).toEqual({ closed: false })
  })

  it('schreibt NICHT, wenn nichts zu ändern ist', () => {
    // `null` heißt „keine Änderung": ein Update, das denselben Wert schreibt,
    // wäre ein Realtime-Ereignis ohne Neuigkeit.
    expect(memberAfterMessage(false)).toBeNull()
  })

  it('löscht erst, wenn ALLE Teilnehmer entfernt haben', () => {
    expect(conversationIsAbandoned([true, false])).toBe(false)
    expect(conversationIsAbandoned([true, true])).toBe(true)
    expect(conversationIsAbandoned([])).toBe(false)
  })
})
