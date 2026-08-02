import { describe, expect, it } from 'vitest'
import type { Models, TablesDB } from 'node-appwrite'
import {
  PAST_DUE_GRACE_DAYS,
  shouldLiftBillingSuspension,
  shouldSuspendForPastDue,
  type CommunityBillingState,
} from '../shared/communityBilling'
import { collectPastDueWork } from '../server/utils/pastDueSweep'

/**
 * Zahlungsverzug → Sperre (M13, Auslöser 2), festgenagelt.
 *
 * Die Zeit wird INJIZIERT (`now`), nicht gemessen: eine Frist von vierzehn Tagen
 * lässt sich sonst nicht deterministisch prüfen, und ein Test, der nur an einem
 * bestimmten Kalendertag grün ist, beweist nichts.
 */
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-08-20T12:00:00.000Z')

function community(overrides: Partial<CommunityBillingState> = {}): CommunityBillingState {
  return {
    status: 'active',
    billingStatus: 'past_due',
    suspension: '',
    pastDueSince: new Date(NOW - 20 * DAY).toISOString(),
    ...overrides,
  }
}

describe('shouldSuspendForPastDue', () => {
  it('sperrt, wenn die Frist abgelaufen ist', () => {
    expect(shouldSuspendForPastDue(community(), NOW)).toBe(true)
  })

  it('sperrt am letzten Tag NICHT und am Stichtag doch', () => {
    const justBefore = new Date(NOW - (PAST_DUE_GRACE_DAYS * DAY) + 1).toISOString()
    const exactly = new Date(NOW - PAST_DUE_GRACE_DAYS * DAY).toISOString()
    expect(shouldSuspendForPastDue(community({ pastDueSince: justBefore }), NOW)).toBe(false)
    expect(shouldSuspendForPastDue(community({ pastDueSince: exactly }), NOW)).toBe(true)
  })

  it('rührt eine bestehende Sperre NIE an', () => {
    // Sonst stufte der Sweep eine abuse-Sperre stillschweigend auf „nur-lesend"
    // herunter und brächte eine gesperrte Community zurück ins Netz.
    expect(shouldSuspendForPastDue(community({ suspension: 'abuse' }), NOW)).toBe(false)
    expect(shouldSuspendForPastDue(community({ suspension: 'billing' }), NOW)).toBe(false)
  })

  it('lässt eine stillgelegte Community in Ruhe — die ist schon offline', () => {
    expect(shouldSuspendForPastDue(community({ status: 'disabled' }), NOW)).toBe(false)
  })

  it('sperrt nur bei past_due — nicht bei bezahlt, gekündigt oder nie gehabt', () => {
    for (const billingStatus of ['active', 'canceled', '']) {
      expect(shouldSuspendForPastDue(community({ billingStatus }), NOW), billingStatus).toBe(false)
    }
  })

  it('sperrt ohne Stempel nicht — und bei unlesbarem Datum auch nicht (fail-open)', () => {
    expect(shouldSuspendForPastDue(community({ pastDueSince: null }), NOW)).toBe(false)
    expect(shouldSuspendForPastDue(community({ pastDueSince: 'gestern' }), NOW)).toBe(false)
  })
})

describe('shouldLiftBillingSuspension', () => {
  it('hebt auf, sobald kein Verzug mehr besteht', () => {
    expect(shouldLiftBillingSuspension({ suspension: 'billing', billingStatus: 'active' })).toBe(true)
    expect(shouldLiftBillingSuspension({ suspension: 'billing', billingStatus: 'canceled' })).toBe(true)
  })

  it('lässt eine laufende Mahnung stehen', () => {
    expect(shouldLiftBillingSuspension({ suspension: 'billing', billingStatus: 'past_due' })).toBe(false)
  })

  it('rührt eine abuse-Sperre nie an — die endet nur durch eine Betreiber-Entscheidung', () => {
    expect(shouldLiftBillingSuspension({ suspension: 'abuse', billingStatus: 'active' })).toBe(false)
  })

  it('tut bei einer ungesperrten Community nichts', () => {
    expect(shouldLiftBillingSuspension({ suspension: '', billingStatus: 'active' })).toBe(false)
  })
})

/**
 * DER ARBEITSVORRAT DES LAUFS (Audit-Befund: `Query.limit(100)` kappte still).
 *
 * WARUM EIN FAKE UND KEIN ECHTER LAUF: um die Kappung live zu treffen, bräuchte
 * es über hundert Communities in einer echten Appwrite-Instanz — Aufbau und
 * Aufräumen wären teurer als die Aussage. Geprüft wird deshalb genau die
 * Stelle, an der die Kappung saß: die Sammel-Funktion, gegen ein TablesDB, das
 * Seiten wie Appwrite ausliefert (limit + cursorAfter). Der übrige Lauf ist
 * unverändert und hängt an den puren Regeln oben.
 */
function fakeTablesDB(byTable: Record<string, { $id: string }[]>) {
  const pages: number[] = []
  const db = {
    listRows: async ({ queries }: { queries: string[] }) => {
      // Welche Abfrage? Der Sweep stellt genau zwei, unterscheidbar am Filter.
      const key = queries.some(q => q.includes('past_due')) ? 'overdue' : 'suspended'
      const rows = byTable[key] ?? []
      const limit = Number(JSON.parse(queries.find(q => q.includes('"limit"'))!).values[0])
      const cursorQuery = queries.find(q => q.includes('cursorAfter'))
      const cursor = cursorQuery ? String(JSON.parse(cursorQuery).values[0]) : undefined
      const start = cursor ? rows.findIndex(r => r.$id === cursor) + 1 : 0
      const page = rows.slice(start, start + limit)
      pages.push(page.length)
      return { total: rows.length, rows: page }
    },
  }
  return { db: db as unknown as TablesDB, pages }
}

const communities = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ $id: `${prefix}-${i}` }) as unknown as Models.Row)

describe('collectPastDueWork', () => {
  it('sammelt ÜBER die 100er-Seite hinaus — beide Vorräte vollständig', async () => {
    const { db } = fakeTablesDB({
      overdue: communities('overdue', 137) as { $id: string }[],
      suspended: communities('suspended', 231) as { $id: string }[],
    })
    const work = await collectPastDueWork(db, 'db')
    expect(work.overdue).toHaveLength(137)
    expect(work.suspended).toHaveLength(231)
    // Die letzte Zeile ist der eigentliche Beweis: sie lag jenseits der Kappung.
    expect(work.overdue.at(-1)?.$id).toBe('overdue-136')
    expect(work.suspended.at(-1)?.$id).toBe('suspended-230')
  })

  it('die ENTSPERR-Hälfte erreicht auch die 101. Community', async () => {
    // Das ist die Hälfte, die weh tut: nach oben fehlte nur eine verspätete
    // Sperre, nach unten blieb jemand gesperrt, der längst bezahlt hat.
    const { db } = fakeTablesDB({ overdue: [], suspended: communities('suspended', 101) as { $id: string }[] })
    const work = await collectPastDueWork(db, 'db')
    expect(work.suspended.map(r => r.$id)).toContain('suspended-100')
  })

  it('bei genau einer vollen Seite fragt es einmal nach und hört dann auf', async () => {
    const { db, pages } = fakeTablesDB({ overdue: communities('overdue', 100) as { $id: string }[], suspended: [] })
    const work = await collectPastDueWork(db, 'db')
    expect(work.overdue).toHaveLength(100)
    // 100 (voll) → nachfragen → 0 (leer) → Ende. Plus die eine leere Abfrage
    // des zweiten Vorrats.
    expect(pages.filter(n => n === 100)).toHaveLength(1)
    expect(pages.filter(n => n === 0)).toHaveLength(2)
  })

  it('leere Tabelle → leere Vorräte, kein Absturz', async () => {
    const { db } = fakeTablesDB({ overdue: [], suspended: [] })
    expect(await collectPastDueWork(db, 'db')).toEqual({ overdue: [], suspended: [] })
  })
})
