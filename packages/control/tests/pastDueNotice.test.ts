import { describe, expect, it } from 'vitest'
import { communityNeedsPastDueNotice, pastDueNoticeTitle } from '../shared/pastDueNotice'
import type { TenantRow } from '../shared/types/tenantRecord'

/**
 * Wer bekommt eine Zahlungswarnung in die COMMUNITY-Glocke (Davids Entscheidung
 * vom 2026-08-03)?
 *
 * Die Regel ist pure und hier vollständig durchgespielt, weil sie zwei Fehler
 * verhindern muss, die beide still wären: eine Warnung an eine Community, die
 * niemand lesen kann (offline, stillgelegt, fremdes Projekt), und eine
 * AUSBLEIBENDE Warnung vor einer Sperre, die 14 Tage später kommt.
 */

const POOL = 'pool-project'

function community(overrides: Partial<TenantRow> = {}): Parameters<typeof communityNeedsPastDueNotice>[0] {
  return {
    billingStatus: 'past_due',
    pastDueSince: '2026-08-01T00:00:00.000Z',
    status: 'active',
    suspension: '',
    mode: 'pool',
    projectId: POOL,
    tenantId: 't-kunde-a',
    ...overrides,
  } as Parameters<typeof communityNeedsPastDueNotice>[0]
}

describe('communityNeedsPastDueNotice', () => {
  it('meldet die überfällige Pool-Community dieses Projekts', () => {
    expect(communityNeedsPastDueNotice(community(), POOL)).toBe(true)
  })

  it('meldet auch, wenn wegen Zahlung bereits gesperrt ist — dann ist der Hinweis die Erklärung', () => {
    expect(communityNeedsPastDueNotice(community({ suspension: 'billing' }), POOL)).toBe(true)
  })

  it.each([
    ['bezahlt', { billingStatus: 'active' }],
    ['gekündigt', { billingStatus: 'canceled' }],
    ['nie ein Abo gehabt', { billingStatus: null }],
  ])('meldet nicht, wenn %s', (_label, patch) => {
    expect(communityNeedsPastDueNotice(community(patch), POOL)).toBe(false)
  })

  it.each([
    ['kein Verzugsbeginn steht', { pastDueSince: null }],
    ['der Verzugsbeginn unlesbar ist', { pastDueSince: 'irgendwann' }],
  ])('meldet nicht, wenn %s (ohne ihn gäbe es keinen Idempotenz-Schlüssel)', (_label, patch) => {
    expect(communityNeedsPastDueNotice(community(patch), POOL)).toBe(false)
  })

  it('meldet nicht an eine stillgelegte Community — dort liest niemand', () => {
    expect(communityNeedsPastDueNotice(community({ status: 'disabled' }), POOL)).toBe(false)
  })

  it('meldet nicht bei einer Missbrauchs-Sperre — der Host ist komplett offline', () => {
    expect(communityNeedsPastDueNotice(community({ suspension: 'abuse' }), POOL)).toBe(false)
  })

  it('meldet nicht für ein FREMDES Runtime-Projekt (Silo-Community, andere App)', () => {
    expect(communityNeedsPastDueNotice(community({ projectId: 'andere-app' }), POOL)).toBe(false)
    expect(communityNeedsPastDueNotice(community({ mode: 'silo', tenantId: '' }), POOL)).toBe(false)
  })

  it('meldet nicht ohne tenantId — der Stempel wäre leer und die Zeile fail-open überall sichtbar', () => {
    expect(communityNeedsPastDueNotice(community({ tenantId: '' }), POOL)).toBe(false)
  })

  it('meldet nicht ohne Runtime-Projekt (Fehlkonfiguration darf nicht alles treffen)', () => {
    expect(communityNeedsPastDueNotice(community(), '')).toBe(false)
  })
})

describe('pastDueNoticeTitle', () => {
  it('nimmt den Namen', () => {
    expect(pastDueNoticeTitle({ name: 'Surfclub', host: 'surf.pukalani.app' })).toBe('Surfclub')
  })

  it('fällt auf den Host zurück, nie auf eine Row-Id', () => {
    expect(pastDueNoticeTitle({ name: '', host: 'surf.pukalani.app' })).toBe('surf.pukalani.app')
  })
})
