import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_SCOPE_ACCOUNT,
  notificationAudienceFor,
  notificationScopeValue,
  notificationVisibleFor,
  visibleNotificationScopes,
} from '../shared/notificationScope'

/**
 * Der Stempel-Vertrag der Benachrichtigungen (C15 / Audit S6) — die pure Regel,
 * an der Schreiben (notify), Lesen (Leseroute) und Realtime (Glocke) hängen.
 *
 * Drei Zustände sind zu beweisen, weil genau sie die Entscheidungen vom
 * 2026-07-29 abbilden: Pool stempelt, Silo bleibt leer, mandantenlos ist
 * EXPLIZIT — und Bestandszeilen bleiben sichtbar (fail-OPEN, die begründete
 * Ausnahme).
 */
describe('notificationScopeValue — was notify() in die Spalte schreibt', () => {
  it('Pool + scope tenant → die Mandanten-Id', () => {
    expect(notificationScopeValue('tenant', 'tenant-a')).toBe('tenant-a')
  })

  it('Silo/Single-Tenant + scope tenant → leer (es gibt dort keine Mandanten)', () => {
    expect(notificationScopeValue('tenant', null)).toBe('')
  })

  it('scope account → der Sentinel, AUCH im Pool (mandantenlos ist explizit)', () => {
    expect(notificationScopeValue('account', 'tenant-a')).toBe(NOTIFICATION_SCOPE_ACCOUNT)
    expect(notificationScopeValue('account', null)).toBe(NOTIFICATION_SCOPE_ACCOUNT)
  })

  it('der Sentinel kann keine echte Mandanten-Id sein (Appwrite-Id-Regel)', () => {
    // Row-Ids dürfen nicht mit einem Sonderzeichen beginnen — deshalb ist
    // `_account` kollisionsfrei und braucht keine zweite Spalte.
    expect(NOTIFICATION_SCOPE_ACCOUNT.startsWith('_')).toBe(true)
  })
})

describe('notificationAudienceFor — in welcher Welt hängt die Glocke', () => {
  it('Mandanten-Id vorhanden → Community-Host', () => {
    expect(notificationAudienceFor('tenant-a', false)).toEqual({ kind: 'tenant', tenantId: 'tenant-a' })
  })

  it('kein Mandant, aber Kontroll-Host → Kundenbereich', () => {
    expect(notificationAudienceFor(null, true)).toEqual({ kind: 'account' })
  })

  it('kein Mandant, kein Kontroll-Host → Silo (eine Welt)', () => {
    expect(notificationAudienceFor(null, false)).toEqual({ kind: 'all' })
  })

  it('ein Mandanten-Host bleibt Mandant, auch wenn das Kontroll-Flag lügt', () => {
    // Reihenfolge der Prüfung festgenagelt: ein aufgelöster Mandant gewinnt.
    // Ein Host kann nicht beides sein (00.tenant.ts entscheidet exklusiv).
    expect(notificationAudienceFor('tenant-a', true)).toEqual({ kind: 'tenant', tenantId: 'tenant-a' })
  })
})

describe('visibleNotificationScopes — welche Spaltenwerte eine Glocke zeigt', () => {
  it('Community-Host: die eigene Id UND der ungestempelte Bestand', () => {
    expect(visibleNotificationScopes({ kind: 'tenant', tenantId: 'tenant-a' })).toEqual(['tenant-a', ''])
  })

  it('Kundenbereich: der Sentinel UND der ungestempelte Bestand', () => {
    expect(visibleNotificationScopes({ kind: 'account' })).toEqual([NOTIFICATION_SCOPE_ACCOUNT, ''])
  })

  it('Silo: kein Filter (null = alles, Verhalten unverändert)', () => {
    expect(visibleNotificationScopes({ kind: 'all' })).toBeNull()
  })
})

describe('notificationVisibleFor — die Isolation, Zeile für Zeile', () => {
  const communityA = { kind: 'tenant', tenantId: 'tenant-a' } as const
  const communityB = { kind: 'tenant', tenantId: 'tenant-b' } as const

  it('Community A zeigt A, nicht B', () => {
    expect(notificationVisibleFor(communityA, { communityId: 'tenant-a' })).toBe(true)
    expect(notificationVisibleFor(communityA, { communityId: 'tenant-b' })).toBe(false)
    expect(notificationVisibleFor(communityB, { communityId: 'tenant-a' })).toBe(false)
  })

  it('kontobezogene Meldungen erscheinen NICHT in einer Community-Glocke', () => {
    // Davids Entscheidung 3: ein Mitglied darf keine Zahlungswarnung sehen,
    // die den Betreiber-Vertrag betrifft.
    expect(notificationVisibleFor(communityA, { communityId: NOTIFICATION_SCOPE_ACCOUNT })).toBe(false)
    expect(notificationVisibleFor({ kind: 'account' }, { communityId: NOTIFICATION_SCOPE_ACCOUNT })).toBe(true)
  })

  it('Community-Meldungen erscheinen NICHT im Kundenbereich', () => {
    expect(notificationVisibleFor({ kind: 'account' }, { communityId: 'tenant-a' })).toBe(false)
  })

  it('BESTANDSZEILEN ohne Stempel bleiben überall sichtbar — fail-OPEN', () => {
    // Die bewusste Ausnahme (Davids Entscheidung 2): sonst leert sich jedem
    // Nutzer im Moment des Deploys die Glocke. NICHT auf fail-closed drehen.
    for (const row of [{ tenantId: '' }, {}, { tenantId: null }]) {
      expect(notificationVisibleFor(communityA, row)).toBe(true)
      expect(notificationVisibleFor(communityB, row)).toBe(true)
      expect(notificationVisibleFor({ kind: 'account' }, row)).toBe(true)
    }
  })

  it('Silo zeigt alles — auch gestempelte Zeilen', () => {
    expect(notificationVisibleFor({ kind: 'all' }, { tenantId: 'tenant-a' })).toBe(true)
    expect(notificationVisibleFor({ kind: 'all' }, { tenantId: NOTIFICATION_SCOPE_ACCOUNT })).toBe(true)
    expect(notificationVisibleFor({ kind: 'all' }, {})).toBe(true)
  })
})
