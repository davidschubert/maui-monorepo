import { describe, expect, it } from 'vitest'
import { listUserDataContributors, registerUserDataContributor } from '../server/utils/userData'
import { listAllRows } from '../server/utils/listAllRows'
import type { Models, TablesDB } from 'node-appwrite'

function contributor(id: string) {
  return {
    id,
    exportUserData: async () => ({}),
    deleteUserData: async () => ({ deleted: 0, anonymized: 0 }),
  }
}

describe('UserDataContributor-Registry', () => {
  it('registriert idempotent und listet deterministisch sortiert', () => {
    registerUserDataContributor(contributor('system'))
    registerUserDataContributor(contributor('comments'))
    registerUserDataContributor(contributor('moderation'))
    // Doppel-Registrierung (HMR) überschreibt, dupliziert nicht
    registerUserDataContributor(contributor('comments'))

    const ids = listUserDataContributors().map(c => c.id)
    expect(ids).toEqual(['comments', 'moderation', 'system'])
  })
})

/** Fake-TablesDB: liefert `rows` seitenweise gemäß limit/cursorAfter. */
function fakeTablesDB(rows: { $id: string }[]) {
  const calls: string[][] = []
  const db = {
    listRows: async ({ queries }: { queries: string[] }) => {
      calls.push(queries)
      const limit = Number(JSON.parse(queries.find(q => q.includes('"limit"'))!).values[0])
      const cursorQuery = queries.find(q => q.includes('cursorAfter'))
      const cursor = cursorQuery ? String(JSON.parse(cursorQuery).values[0]) : undefined
      const start = cursor ? rows.findIndex(r => r.$id === cursor) + 1 : 0
      const page = rows.slice(start, start + limit)
      return { total: rows.length, rows: page }
    },
  }
  return { db: db as unknown as TablesDB, calls }
}

const makeRows = (n: number) => Array.from({ length: n }, (_, i) => ({ $id: `row-${i}` }))

describe('listAllRows', () => {
  it('leere Tabelle → leeres Ergebnis, ein Aufruf', async () => {
    const { db, calls } = fakeTablesDB([])
    expect(await listAllRows(db, 'db', 't', [])).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('eine Teilseite → ein Aufruf', async () => {
    const { db, calls } = fakeTablesDB(makeRows(7))
    expect((await listAllRows(db, 'db', 't', [])).length).toBe(7)
    expect(calls).toHaveLength(1)
  })

  it('2,5 Seiten → drei Aufrufe mit Cursor-Weitergabe, vollständig', async () => {
    const { db, calls } = fakeTablesDB(makeRows(250))
    const result = await listAllRows<Models.Row>(db, 'db', 't', [])
    expect(result.length).toBe(250)
    expect(result.at(-1)!.$id).toBe('row-249')
    expect(calls).toHaveLength(3)
    expect(calls[1]!.some(q => q.includes('row-99'))).toBe(true)
    expect(calls[2]!.some(q => q.includes('row-199'))).toBe(true)
  })

  it('exakt volle letzte Seite → ein Abschluss-Aufruf mit leerer Seite', async () => {
    const { db, calls } = fakeTablesDB(makeRows(200))
    expect((await listAllRows(db, 'db', 't', [])).length).toBe(200)
    expect(calls).toHaveLength(3) // 100 + 100 + 0
  })
})
