import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { USER_STATS_TTL_MS, clearProjectUserCounts, projectUserCounts } from '../server/utils/userStatsCache'

/**
 * Nacht-Audit 2026-08-02, F23: `/api/admin/users/stats` hielt ALLE VIER Zahlen
 * in einer prozessweiten, ungeschlüsselten 60-s-Variablen. Drei sind
 * projektweit (total/active/new), die vierte — `online` aus
 * `listOnlinePresences(event)` — ist seit A4 mandantengescopt. Ein Betreiber,
 * der binnen einer Minute zwei Community-Hosts ansah, bekam auf dem zweiten
 * die Anwesenheitszahl des ersten.
 *
 * Gefixt wurde durch TRENNEN statt Schlüsseln: nur der teure projektweite Teil
 * wird gecacht (ein Cursor-Scan über bis zu 5.000 Nutzer), `online` kommt
 * frisch. Ein mandantengeschlüsselter Cache hätte den Scan pro Community
 * wiederholt — für jedes Mal dasselbe Ergebnis.
 */
const routeSource = readFileSync(
  fileURLToPath(new URL('../server/api/admin/users/stats.get.ts', import.meta.url)),
  'utf8',
)

afterEach(() => {
  clearProjectUserCounts()
  vi.useRealTimers()
})

describe('projectUserCounts — der Cache hält nur Projektweites', () => {
  it('zweiter Aufruf im TTL lädt NICHT nach', async () => {
    const load = vi.fn(async () => ({ total: 10, active: 4, new: 2 }))
    expect(await projectUserCounts('pool', load)).toEqual({ total: 10, active: 4, new: 2 })
    expect(await projectUserCounts('pool', load)).toEqual({ total: 10, active: 4, new: 2 })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('ein ANDERES Appwrite-Projekt bekommt seinen eigenen Eintrag', async () => {
    const a = vi.fn(async () => ({ total: 10, active: 4, new: 2 }))
    const b = vi.fn(async () => ({ total: 99, active: 9, new: 9 }))
    await projectUserCounts('pool', a)
    expect(await projectUserCounts('comments', b)).toEqual({ total: 99, active: 9, new: 9 })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('nach Ablauf des TTL wird neu geladen', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => ({ total: 10, active: 4, new: 2 }))
    await projectUserCounts('pool', load)
    vi.advanceTimersByTime(USER_STATS_TTL_MS + 1)
    await projectUserCounts('pool', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('trägt KEIN `online` — der Befund, strukturell ausgeschlossen', async () => {
    const counts = await projectUserCounts('pool', async () => ({ total: 10, active: 4, new: 2 }))
    expect(Object.keys(counts).sort()).toEqual(['active', 'new', 'total'])
    expect('online' in counts).toBe(false)
  })
})

describe('die Route selbst', () => {
  it('holt `online` AUSSERHALB des gecachten Laders', () => {
    // Der Lader endet mit dem return der drei Projektzahlen; der
    // Presences-Aufruf steht danach im Handler.
    const loaderEnd = routeSource.indexOf('return { total: totalRes.total')
    const presence = routeSource.indexOf('listOnlinePresences(event)')
    expect(loaderEnd).toBeGreaterThan(0)
    expect(presence).toBeGreaterThan(loaderEnd)
  })

  it('hat keine eigene prozessweite Cache-Variable mehr', () => {
    expect(routeSource).not.toMatch(/let cache/)
    expect(routeSource).toContain('projectUserCounts(')
  })
})
