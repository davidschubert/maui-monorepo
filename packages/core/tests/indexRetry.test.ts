import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INDEX_NUDGE_AFTER_ATTEMPT,
  createIndexSteps,
  isColumnNotAvailable,
  tableCacheNudge,
  withIndexRetry,
} from '../../../scripts/migrations-lib/indexRetry.mts'

/**
 * F19 — der Cache-Anstoß bei `column_not_available`.
 *
 * Warum es diese Tests gibt: gegen den VERGIFTETEN Cache (gecachtes
 * Collection-Dokument zeigt die Spalte dauerhaft als 'processing') führt kein
 * Wiederhol-Vorrat zum Ziel — nur ein Schreibzugriff auf die Tabelle räumt ihn.
 * Zwei Dinge müssen deshalb stimmen und dürfen nicht verrutschen:
 *   1. Der Anstoß kommt NICHT sofort (der harmlose Nachhinker löst sich selbst),
 *      aber verlässlich, sobald es hakt.
 *   2. Er schreibt den Zustand VOLLSTÄNDIG zurück. `updateTable` setzt
 *      rowSecurity/enabled bedingungslos — ein Anstoß mit bloßem `name` würde
 *      die Zeilen-Sicherheit abschalten. Dafür unten eine echte Gegenprobe.
 */

const spaltenFehler = () => Object.assign(new Error('The requested column \'x\' is not yet available.'), {
  code: 400,
  type: 'column_not_available',
})

describe('isColumnNotAvailable', () => {
  it('erkennt den Spalten-Race am Typ', () => {
    expect(isColumnNotAvailable(spaltenFehler())).toBe(true)
  })

  it('lässt jeden anderen 400er in Ruhe — sonst verstecken wir echte Fehler', () => {
    expect(isColumnNotAvailable(Object.assign(new Error('bad'), { code: 400, type: 'general_argument_invalid' }))).toBe(false)
    expect(isColumnNotAvailable(Object.assign(new Error('nope'), { code: 409 }))).toBe(false)
  })
})

describe('withIndexRetry — Anstoß', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /**
   * Lässt die Wiederhol-Pausen durchlaufen, ohne echte Zeit zu verbrennen.
   *
   * Das Ergebnis wird SOFORT eingefangen (`.then(…, …)`), bevor die Uhr
   * vorgestellt wird: sonst lehnt das Promise ab, während noch niemand
   * zuhört, und Vitest meldet eine unbehandelte Ablehnung.
   */
  async function laufenLassen<T>(p: Promise<T>): Promise<T> {
    const fertig = p.then(wert => ({ ok: true as const, wert }), fehler => ({ ok: false as const, fehler }))
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(10_000)
    const ergebnis = await fertig
    if (ergebnis.ok) return ergebnis.wert
    throw ergebnis.fehler
  }

  it('stößt gar nicht an, wenn es beim ersten Versuch klappt', async () => {
    const nudge = vi.fn(async () => {})
    const run = vi.fn(async () => 'ok')
    await expect(laufenLassen(withIndexRetry(run, 'Index', nudge))).resolves.toBe('ok')
    expect(nudge).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('wartet die harmlosen Versuche ab, BEVOR es anstößt', async () => {
    const nudge = vi.fn(async () => {})
    let versuche = 0
    const run = vi.fn(async () => {
      versuche++
      // Erst nach dem Anstoß-Versuch erfolgreich
      if (versuche <= INDEX_NUDGE_AFTER_ATTEMPT) throw spaltenFehler()
      return 'ok'
    })
    await expect(laufenLassen(withIndexRetry(run, 'Index', nudge))).resolves.toBe('ok')
    expect(nudge).toHaveBeenCalledTimes(1)
    // Der Anstoß darf nicht schon beim ersten Fehlversuch kommen
    expect(versuche).toBeGreaterThan(INDEX_NUDGE_AFTER_ATTEMPT)
  })

  it('ist FAIL-SOFT: ein misslungener Anstoß bricht nichts ab', async () => {
    const nudge = vi.fn(async () => { throw new Error('Netz weg') })
    let versuche = 0
    const run = vi.fn(async () => {
      versuche++
      if (versuche <= INDEX_NUDGE_AFTER_ATTEMPT + 1) throw spaltenFehler()
      return 'ok'
    })
    await expect(laufenLassen(withIndexRetry(run, 'Index', nudge))).resolves.toBe('ok')
    expect(nudge).toHaveBeenCalled()
  })

  it('stößt bei einem FREMDEN Fehler nicht an und wirft sofort', async () => {
    const nudge = vi.fn(async () => {})
    const run = vi.fn(async () => { throw Object.assign(new Error('duplicate'), { code: 409 }) })
    await expect(laufenLassen(withIndexRetry(run, 'Index', nudge))).rejects.toThrow('duplicate')
    expect(nudge).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('wiederholt den harmlosen Nachhinker, bevor überhaupt angestoßen wird', async () => {
    const nudge = vi.fn(async () => {})
    let versuche = 0
    const run = vi.fn(async () => {
      versuche++
      if (versuche < 3) throw spaltenFehler()
      return 'ok'
    })
    await expect(laufenLassen(withIndexRetry(run, 'Index', nudge))).resolves.toBe('ok')
    expect(nudge).not.toHaveBeenCalled()
  })
})

/**
 * Der eigentliche F19-Nachlese-Punkt (2026-08-02): der Anstoß darf nicht am
 * Aufrufer hängen. Er war einen Tag lang ein optionales drittes Argument — 2
 * von 63 Migrationen reichten ihn durch, und eine der 61 anderen legte die
 * CI-E2E lahm. Diese Tests nageln fest, dass die Fabrik ihn SELBST verdrahtet:
 * es gibt keinen Aufruf mehr, der ohne Anstoß möglich wäre.
 */
describe('createIndexSteps — der Anstoß hängt nicht mehr am Aufrufer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function attrappe(fehlversuche: number) {
    let versuche = 0
    const createIndex = vi.fn(async () => {
      versuche++
      if (versuche <= fehlversuche) throw spaltenFehler()
      return { $id: 'idx' }
    })
    const getTable = vi.fn(async () => ({ name: 'Medien', enabled: true, rowSecurity: true, $permissions: [] }))
    const updateTable = vi.fn(async () => ({}))
    return { createIndex, getTable, updateTable }
  }

  async function laufenLassen<T>(p: Promise<T>): Promise<T> {
    const fertig = p.then(wert => ({ ok: true as const, wert }), fehler => ({ ok: false as const, fehler }))
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(10_000)
    const ergebnis = await fertig
    if (ergebnis.ok) return ergebnis.wert
    throw ergebnis.fehler
  }

  it('reicht databaseId + Spezifikation an createIndex durch', async () => {
    const db = attrappe(0)
    const { indexStep } = createIndexSteps(db, 'main')
    await laufenLassen(indexStep('Index media_items.idx_tenant', {
      tableId: 'media_items', key: 'idx_tenant', type: 'key', columns: ['tenantId'],
    }))
    expect(db.createIndex).toHaveBeenCalledWith({
      databaseId: 'main', tableId: 'media_items', key: 'idx_tenant', type: 'key', columns: ['tenantId'],
    })
  })

  it('stößt VON SELBST an — ohne dass der Aufrufer etwas mitgibt', async () => {
    const db = attrappe(INDEX_NUDGE_AFTER_ATTEMPT)
    const { indexStep } = createIndexSteps(db, 'main')
    await laufenLassen(indexStep('Index media_items.idx_tenant', {
      tableId: 'media_items', key: 'idx_tenant', type: 'key', columns: ['tenantId'],
    }))
    // Genau die Tabelle des Index wird angestoßen — sie kann gar nicht
    // auseinanderlaufen, weil es nur EINE tableId gibt.
    expect(db.updateTable).toHaveBeenCalledWith(expect.objectContaining({
      databaseId: 'main', tableId: 'media_items', rowSecurity: true, enabled: true,
    }))
  })

  it('schluckt 409 wie das step() der Migrationen', async () => {
    const db = attrappe(0)
    db.createIndex.mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 409 }))
    const { indexStep } = createIndexSteps(db, 'main')
    await expect(laufenLassen(indexStep('Index x.y', { tableId: 'x', key: 'y', type: 'key', columns: ['z'] })))
      .resolves.toBeUndefined()
  })

  it('createIndex (roh) wirft 409 weiter — dort handhabt die Migration es selbst', async () => {
    const db = attrappe(0)
    db.createIndex.mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 409 }))
    const { createIndex } = createIndexSteps(db, 'main')
    await expect(laufenLassen(createIndex({ tableId: 'x', key: 'y', type: 'key', columns: ['z'] })))
      .rejects.toThrow('exists')
  })
})

describe('tableCacheNudge', () => {
  it('schreibt den Zustand VOLLSTÄNDIG zurück (Gegenprobe gegen den naiven Anstoß)', async () => {
    const getTable = vi.fn(async () => ({
      name: 'Medien',
      enabled: true,
      rowSecurity: true,
      $permissions: ['read("users")'],
    }))
    const updateTable = vi.fn(async () => ({}))

    await tableCacheNudge({ getTable, updateTable }, 'main', 'media_items')()

    expect(updateTable).toHaveBeenCalledWith({
      databaseId: 'main',
      tableId: 'media_items',
      name: 'Medien',
      permissions: ['read("users")'],
      rowSecurity: true,
      enabled: true,
    })
    // Der eigentliche Punkt: rowSecurity darf NICHT fehlen. Fehlte es, setzte
    // Appwrite es auf false und die Zeilen-Sicherheit wäre still abgeschaltet.
    const args = updateTable.mock.calls[0]![0] as Record<string, unknown>
    expect(Object.keys(args)).toContain('rowSecurity')
    expect(Object.keys(args)).toContain('enabled')
  })
})
