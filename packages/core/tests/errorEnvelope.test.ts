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
    expect(domainReasonFrom({ code: '/api/site/members' })).toBeNull()
    expect(domainReasonFrom({ code: '' })).toBeNull()
    expect(domainReasonFrom({ code: '1_first' })).toBeNull()
    expect(domainReasonFrom({ code: `a${'b'.repeat(70)}` })).toBeNull()
  })
})

describe('statusToErrorCode', () => {
  it('bildet die bekannten Stati ab', () => {
    expect(statusToErrorCode(409)).toBe('CONFLICT')
    expect(statusToErrorCode(403)).toBe('FORBIDDEN')
    expect(statusToErrorCode(500)).toBe('INTERNAL_ERROR')
  })
})
