import { describe, expect, it } from 'vitest'
import { domainReasonFrom, statusToErrorCode } from '../shared/types/error'

/**
 * Das Fehler-Envelope trägt seit 2026-07-29 einen FACHLICHEN Grund
 * (`reason`) — vorher kam beim Client nur „CONFLICT" an, und die Oberfläche
 * konnte „es muss ein Inhaber bleiben" nicht von „irgendwas ging schief"
 * unterscheiden.
 *
 * Die Extraktion ist absichtlich streng: `data` eines Fehlers kann alles
 * enthalten (auch Appwrite-Details), und genau deshalb darf NUR ein kurzer
 * Schlüssel-String durch.
 */
describe('domainReasonFrom', () => {
  it('lässt einen Schlüssel durch', () => {
    expect(domainReasonFrom({ code: 'last_owner' })).toBe('last_owner')
    expect(domainReasonFrom({ code: 'self_demote', more: 'egal' })).toBe('self_demote')
  })

  it('lässt alles andere draußen', () => {
    expect(domainReasonFrom(undefined)).toBeNull()
    expect(domainReasonFrom(null)).toBeNull()
    expect(domainReasonFrom('last_owner')).toBeNull()
    expect(domainReasonFrom({})).toBeNull()
    expect(domainReasonFrom({ code: 42 })).toBeNull()
    expect(domainReasonFrom({ code: { nested: true } })).toBeNull()
  })

  it('weist Werte ab, die keine Schlüssel sind (Nachrichten, Pfade, Großschreibung)', () => {
    expect(domainReasonFrom({ code: 'Es muss ein Inhaber bleiben' })).toBeNull()
    expect(domainReasonFrom({ code: 'LAST_OWNER' })).toBeNull()
    expect(domainReasonFrom({ code: '/api/community/members' })).toBeNull()
    expect(domainReasonFrom({ code: '' })).toBeNull()
    expect(domainReasonFrom({ code: '1_first' })).toBeNull()
    expect(domainReasonFrom({ code: `a${'b'.repeat(70)}` })).toBeNull()
  })
})

/**
 * Seit 2026-08-02 gilt der Grund auch bei 5xx (Audit-Befund „tote
 * Fehlerhälfte"). Die Extraktion selbst kannte den Status nie — die Grenze
 * zog der Handler. Hier steht deshalb, WARUM sie fiel: es gibt 5xx, die eine
 * handlungsleitende Auskunft tragen.
 */
describe('domainReasonFrom bei Server-Fehlern', () => {
  it('lässt den Grund einer unvollständigen Löschung durch', () => {
    expect(domainReasonFrom({ code: 'deletion_incomplete' })).toBe('deletion_incomplete')
  })

  it('bleibt trotzdem streng — eine Ausnahme-Message kommt nicht durch', () => {
    expect(domainReasonFrom({ code: 'AppwriteException: table not found' })).toBeNull()
    expect(domainReasonFrom({ message: 'deletion_incomplete' })).toBeNull()
  })
})

describe('statusToErrorCode', () => {
  it('bildet die bekannten Stati ab', () => {
    expect(statusToErrorCode(409)).toBe('CONFLICT')
    expect(statusToErrorCode(403)).toBe('FORBIDDEN')
    expect(statusToErrorCode(500)).toBe('INTERNAL_ERROR')
  })
})
