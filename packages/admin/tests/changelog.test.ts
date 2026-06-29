import { describe, it, expect } from 'vitest'
import { compareChangelogByVersion, rowToChangelogEntry, type ChangelogRow } from '../shared/changelog'

const v = (version: string, date: string, $createdAt = date) => ({ version, date, $createdAt })

describe('compareChangelogByVersion', () => {
  it('sortiert Versionen numerisch absteigend (nicht lexikografisch)', () => {
    const sorted = [v('v1.9', 'd'), v('v1.10', 'd'), v('v2', 'd')].sort(compareChangelogByVersion)
    expect(sorted.map(x => x.version)).toEqual(['v2', 'v1.10', 'v1.9'])
  })

  it('v1.10 ist neuer als v1.9 (Segment-numerisch, nicht "1.1" < "1.9")', () => {
    expect(compareChangelogByVersion(v('v1.10', 'd'), v('v1.9', 'd'))).toBeLessThan(0)
  })

  it('Einträge MIT Version stehen vor solchen ohne', () => {
    const sorted = [{ date: 'z' }, v('v1.0', 'a')].sort(compareChangelogByVersion)
    expect(sorted[0]!.version).toBe('v1.0')
  })

  it('gleiche/keine Version → Datum absteigend', () => {
    const sorted = [{ date: '2026-01-01' }, { date: '2026-06-01' }].sort(compareChangelogByVersion)
    expect(sorted.map(x => x.date)).toEqual(['2026-06-01', '2026-01-01'])
  })

  it("'v'-Prefix optional und case-insensitiv", () => {
    expect(compareChangelogByVersion(v('2.0', 'd'), v('V1.0', 'd'))).toBeLessThan(0)
  })

  it('Datum fällt auf $createdAt zurück, wenn date fehlt', () => {
    expect(compareChangelogByVersion({ $createdAt: '2026-06-01' }, { $createdAt: '2026-01-01' })).toBeLessThan(0)
  })
})

const base: ChangelogRow = {
  $id: 'x', $createdAt: '2026-06-01T00:00:00.000Z', $updatedAt: '', $permissions: [],
  $databaseId: '', $tableId: '', $sequence: '',
  title: 'T', body: 'B', date: '2026-06-02', titleEn: 'TE', bodyEn: 'BE',
  category: 'feature', version: '1.5.0', published: true,
}
const mkRow = (over: Record<string, unknown> = {}): ChangelogRow => ({ ...base, ...over } as ChangelogRow)

describe('rowToChangelogEntry', () => {
  it('bildet alle Felder ab', () => {
    expect(rowToChangelogEntry(base)).toMatchObject({
      $id: 'x', title: 'T', body: 'B', titleEn: 'TE', bodyEn: 'BE',
      category: 'feature', version: '1.5.0', published: true, date: '2026-06-02',
    })
  })

  it('füllt fehlende optionale Felder mit leeren Strings', () => {
    const dto = rowToChangelogEntry(mkRow({ titleEn: undefined, bodyEn: undefined, category: undefined, version: undefined }))
    expect(dto.titleEn).toBe('')
    expect(dto.bodyEn).toBe('')
    expect(dto.category).toBe('')
    expect(dto.version).toBe('')
  })

  it('date fällt auf $createdAt zurück', () => {
    expect(rowToChangelogEntry(mkRow({ date: undefined })).date).toBe(base.$createdAt)
  })
})
