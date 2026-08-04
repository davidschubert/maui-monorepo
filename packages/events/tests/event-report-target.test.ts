import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * F15 — DER TEST, DER DAS VERSPRECHEN HÄLT.
 *
 * Der Melde-Knopf an Terminen wurde am 2026-08-01 entfernt, weil `targetType:
 * 'event'` bei keiner Queue ankam (Moderations-Audit Befund 4). Seit F15 ist er
 * zurück — und das ist nur dann ehrlich, wenn der Typ auch wirklich registriert
 * IST. Genau das prüft diese Suite: sie lädt das Nitro-Plugin des events-Layers
 * und sieht nach, was es anmeldet.
 *
 * WARUM MIT GESTUBBTEN GLOBALS: `defineNitroPlugin`, `registerReportTarget` und
 * `tenantDb` sind Nitro-Auto-Imports, die es außerhalb eines Nitro-Builds nicht
 * gibt. Sie hier nachzubauen ist billiger als ein Integrationstest — und prüft
 * genau das, was schiefgehen kann: eine vergessene oder falsch benannte
 * Registrierung.
 */

interface Stubs {
  registered: Map<string, (event: H3Event, id: string) => Promise<boolean> | boolean>
  getCalls: Array<{ table: string, id: string, as: string | undefined }>
  getResult: () => unknown
}

const stubs: Stubs = {
  registered: new Map(),
  getCalls: [],
  getResult: () => ({ $id: 'e-1' }),
}

const globals = globalThis as Record<string, unknown>
globals.defineNitroPlugin = (fn: () => void) => fn
globals.registerReportTarget = (
  targetType: string,
  probe: (event: H3Event, id: string) => Promise<boolean> | boolean,
) => { stubs.registered.set(targetType, probe) }
globals.tenantDb = (_event: H3Event, options?: { as?: string }) => ({
  // `async`, damit ein Fehler als ABGELEHNTES PROMISE herauskommt — genau wie
  // bei der echten Datentür. Ein synchron werfender Stub hätte am `.catch()` des
  // Plugins vorbeigeworfen und einen Fehler behauptet, den es nicht gibt.
  get: async (table: string, id: string) => {
    stubs.getCalls.push({ table, id, as: options?.as })
    return stubs.getResult()
  },
})

const plugin = (await import('../server/plugins/report-target')).default as unknown as () => void
const event = {} as H3Event

beforeEach(() => {
  stubs.registered.clear()
  stubs.getCalls = []
  stubs.getResult = () => ({ $id: 'e-1' })
  plugin()
})

describe('Termine sind ein angemeldeter Melde-Typ', () => {
  it('registriert GENAU den Typ „event" (der Name, den ReportButton schickt)', () => {
    expect([...stubs.registered.keys()]).toEqual(['event'])
  })

  it('bestätigt ein vorhandenes Ziel', async () => {
    await expect(stubs.registered.get('event')!(event, 'e-1')).resolves.toBe(true)
  })
})

describe('die Prüfung läuft durch die Datentür — nicht am Mandanten vorbei', () => {
  it('fragt die events-Tabelle mit der OPERATOR-Klinke und der echten Id', async () => {
    await stubs.registered.get('event')!(event, 'e-42')
    expect(stubs.getCalls).toEqual([{ table: 'events', id: 'e-42', as: 'operator' }])
  })

  it('ein Termin aus einer FREMDEN Community ist „nicht vorhanden"', async () => {
    // Die Datentür wirft dort 404 — die Prüfung muss daraus `false` machen und
    // nicht durchreichen, sonst entstünde eine Meldung auf eine fremde Zeile.
    stubs.getResult = () => { throw new Error('Event not found') }
    await expect(stubs.registered.get('event')!(event, 'fremd')).resolves.toBe(false)
  })

  it('fail-closed auch bei einem kaputten Backend', async () => {
    stubs.getResult = () => { throw new Error('Appwrite weg') }
    await expect(stubs.registered.get('event')!(event, 'e-1')).resolves.toBe(false)
  })
})

describe('die Registrierung ist die Zusage, dass jemand hinschaut', () => {
  it('nennt dieselbe Tabelle, die auch die Queue liest', async () => {
    // Wenn die Queue (`/api/events/moderation`) je auf eine andere Tabelle
    // zeigte, meldete der Knopf wieder ins Leere.
    const { EVENTS_TABLE } = await import('../shared/types/event')
    await stubs.registered.get('event')!(event, 'e-1')
    expect(stubs.getCalls[0]!.table).toBe(EVENTS_TABLE)
  })

  it('meldet sich nicht doppelt an (ein Deployment, ein Besitzer je Typ)', () => {
    plugin()
    expect([...stubs.registered.keys()]).toEqual(['event'])
    expect(vi.isMockFunction(globals.registerReportTarget)).toBe(false)
  })
})
