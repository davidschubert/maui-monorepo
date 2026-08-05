import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  type CommunityJoinDatesLookup,
  type CommunityJoinDatesResolver,
  type CommunityRecentJoinsLookup,
  __resetCommunityJoinDatesResolver,
  registerCommunityJoinDatesResolver,
  resolveJoinDates,
  resolveRecentJoinCount,
} from '../server/utils/communityJoinDates'

/**
 * F1 — der Beitritts-Vertrag: „seit wann ist wer dabei?" und „wie viele kamen
 * zuletzt dazu?".
 *
 * Geprüft wird hier die KLAMMER, nicht der Cross-Projekt-Leser: dass gebündelt
 * gefragt wird, dass ohne Naht nichts passiert und dass ein Ausfall nichts
 * kaputt macht. Der Leser selbst (welche Spalte, welcher Status) hat seinen
 * eigenen Test gegen eine echte Appwrite im control-Layer — ein Fixture könnte
 * genau die Frage nicht beantworten.
 */

const tenantEvent = {
  context: { tenant: { communityId: 'c1', projectId: 'pool' } },
} as unknown as H3Event

/** Silo, Kontroll-Host, Playground: kein Mandant, also nichts zu fragen. */
const plainEvent = { context: {} } as unknown as H3Event

function resolver(overrides: Partial<CommunityJoinDatesResolver> = {}): CommunityJoinDatesResolver {
  return {
    joinedAt: () => ({}),
    recentJoinCount: () => 0,
    ...overrides,
  }
}

beforeEach(() => {
  __resetCommunityJoinDatesResolver()
})

describe('resolveJoinDates', () => {
  it('fragt GEBÜNDELT: viele Ids, EIN Aufruf, dedupliziert', async () => {
    // Die Form ist der Punkt. Ein Einzel-Lookup fände sich später in einer
    // Schleife über 25 Autoren wieder — und jede Runde ginge über eine
    // Projektgrenze.
    const seen: CommunityJoinDatesLookup[] = []
    registerCommunityJoinDatesResolver(resolver({
      joinedAt: (lookup) => {
        seen.push(lookup)
        return { u1: '2024-01-01T00:00:00.000Z' }
      },
    }))

    const dates = await resolveJoinDates(tenantEvent, ['u1', 'u2', 'u1', ''])

    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({ communityId: 'c1', runtimeProjectId: 'pool', runtimeUserIds: ['u1', 'u2'] })
    expect(dates.get('u1')).toBe('2024-01-01T00:00:00.000Z')
    // Wer keine Mitgliedschaft hat, FEHLT — er steht nicht mit leerem Datum da.
    expect(dates.has('u2')).toBe(false)
  })

  it('wirft leere Datumswerte weg statt sie durchzureichen', async () => {
    // Ein leerer String käme beim Konsumenten als „Datum vorhanden" an und
    // würde dort zu einer Dauer von 0 Tagen — also zu „ganz frisch dabei"
    // statt zu „unbekannt".
    registerCommunityJoinDatesResolver(resolver({ joinedAt: () => ({ u1: '' }) }))
    await expect(resolveJoinDates(tenantEvent, ['u1'])).resolves.toEqual(new Map())
  })

  it('ohne Mandanten-Kontext, ohne Resolver und ohne Ids wird nicht gefragt', async () => {
    const joinedAt = vi.fn(() => ({}))

    await expect(resolveJoinDates(tenantEvent, ['u1'])).resolves.toEqual(new Map())

    registerCommunityJoinDatesResolver(resolver({ joinedAt }))
    await expect(resolveJoinDates(plainEvent, ['u1'])).resolves.toEqual(new Map())
    await expect(resolveJoinDates(tenantEvent, [])).resolves.toEqual(new Map())
    await expect(resolveJoinDates(tenantEvent, ['', ''])).resolves.toEqual(new Map())

    expect(joinedAt).not.toHaveBeenCalled()
  })

  it('FAIL-SOFT: ein werfender Resolver kostet das Abzeichen, nicht die Seite', async () => {
    registerCommunityJoinDatesResolver(resolver({
      joinedAt: () => { throw new Error('Control Plane weg') },
    }))
    await expect(resolveJoinDates(tenantEvent, ['u1'])).resolves.toEqual(new Map())
  })
})

describe('resolveRecentJoinCount', () => {
  it('reicht das Fenster durch und gibt die Zahl zurück', async () => {
    const seen: CommunityRecentJoinsLookup[] = []
    registerCommunityJoinDatesResolver(resolver({
      recentJoinCount: (lookup) => {
        seen.push(lookup)
        return 12
      },
    }))

    await expect(resolveRecentJoinCount(tenantEvent, 7)).resolves.toBe(12)
    expect(seen[0]).toEqual({ communityId: 'c1', runtimeProjectId: 'pool', days: 7 })
  })

  it('gibt NULL zurück, wo es nichts zu wissen gibt — nie 0', async () => {
    // Der Unterschied trägt die ganze About-Kachel: 0 hieße „diese Woche kam
    // niemand dazu", null heißt „wir wissen es nicht" und lässt die Kachel weg.
    await expect(resolveRecentJoinCount(tenantEvent, 7)).resolves.toBeNull()

    registerCommunityJoinDatesResolver(resolver({ recentJoinCount: () => 5 }))
    await expect(resolveRecentJoinCount(plainEvent, 7)).resolves.toBeNull()
    await expect(resolveRecentJoinCount(tenantEvent, 0)).resolves.toBeNull()
    await expect(resolveRecentJoinCount(tenantEvent, Number.NaN)).resolves.toBeNull()
  })

  it('FAIL-SOFT: Ausfall und unsinnige Antworten werden zu null', async () => {
    __resetCommunityJoinDatesResolver()
    registerCommunityJoinDatesResolver(resolver({
      recentJoinCount: () => { throw new Error('weg') },
    }))
    await expect(resolveRecentJoinCount(tenantEvent, 7)).resolves.toBeNull()

    __resetCommunityJoinDatesResolver()
    registerCommunityJoinDatesResolver(resolver({ recentJoinCount: () => -3 }))
    await expect(resolveRecentJoinCount(tenantEvent, 7)).resolves.toBeNull()
  })

  it('0 bleibt 0, wenn sie wirklich gemessen wurde', async () => {
    // Die Gegenprobe zur Zeile darüber: eine ECHTE Null ist eine Auskunft und
    // darf nicht als „unbekannt" verschwinden.
    registerCommunityJoinDatesResolver(resolver({ recentJoinCount: () => 0 }))
    await expect(resolveRecentJoinCount(tenantEvent, 7)).resolves.toBe(0)
  })
})
