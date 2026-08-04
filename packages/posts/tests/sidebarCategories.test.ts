import { describe, expect, it } from 'vitest'
import { recentCategoryIds } from '../shared/sidebarCategories'

/**
 * F1 Stufe 3, Stück 4 — „meine letzten Kategorien".
 *
 * Der Test, auf den es ankommt, ist der erste: eine Kategorie, die ich nur
 * KOMMENTIERT habe, muss vor einer stehen können, in der ich selbst gepostet
 * habe. Genau diese Aussage war in Stufe 2 nicht beweisbar und deshalb
 * ungebaut.
 */

describe('recentCategoryIds — eine Zeitachse für Beiträge UND Kommentare', () => {
  it('ein frischer Kommentar schlägt einen älteren eigenen Beitrag', () => {
    const result = recentCategoryIds([
      { categoryId: 'c-gepostet', at: '2026-08-01T10:00:00.000Z' },
      { categoryId: 'c-kommentiert', at: '2026-08-04T10:00:00.000Z' },
    ], 5)

    expect(result).toEqual(['c-kommentiert', 'c-gepostet'])
  })

  it('KEINE GEWICHTUNG: fünfzig Beiträge von gestern schlagen einen Kommentar von heute nicht', () => {
    const touches = Array.from({ length: 50 }, () => ({
      categoryId: 'c-viel', at: '2026-08-03T10:00:00.000Z',
    }))
    touches.push({ categoryId: 'c-einmal', at: '2026-08-04T10:00:00.000Z' })

    expect(recentCategoryIds(touches, 5)).toEqual(['c-einmal', 'c-viel'])
  })
})

describe('recentCategoryIds — Entdopplung', () => {
  it('je Kategorie zählt die JÜNGSTE Berührung, nicht die zuerst gelieferte', () => {
    // Der Aufrufer führt zwei Quellen zusammen und kann ihre Reihenfolge nicht
    // garantieren — die Sortierung darf nicht davon abhängen.
    const result = recentCategoryIds([
      { categoryId: 'a', at: '2026-08-01T10:00:00.000Z' },
      { categoryId: 'b', at: '2026-08-02T10:00:00.000Z' },
      { categoryId: 'a', at: '2026-08-03T10:00:00.000Z' },
    ], 5)

    expect(result).toEqual(['a', 'b'])
  })

  it('liefert jede Kategorie höchstens einmal', () => {
    const result = recentCategoryIds([
      { categoryId: 'a', at: '2026-08-01T10:00:00.000Z' },
      { categoryId: 'a', at: '2026-08-02T10:00:00.000Z' },
    ], 5)

    expect(result).toEqual(['a'])
  })
})

describe('recentCategoryIds — Grenzen', () => {
  it('klemmt auf das Limit', () => {
    const touches = ['a', 'b', 'c', 'd', 'e', 'f'].map((categoryId, i) => ({
      categoryId, at: `2026-08-0${i + 1}T10:00:00.000Z`,
    }))
    expect(recentCategoryIds(touches, 5)).toEqual(['f', 'e', 'd', 'c', 'b'])
  })

  it('GEGENPROBE: Beiträge OHNE Kategorie fallen heraus', () => {
    // Ein Beitrag ohne Kategorie lebt im Feed und gehört in keine Struktur.
    expect(recentCategoryIds([{ categoryId: '', at: '2026-08-04T10:00:00.000Z' }], 5)).toEqual([])
  })

  it('GEGENPROBE: ohne Zeitstempel keine Berührung', () => {
    expect(recentCategoryIds([{ categoryId: 'a', at: '' }], 5)).toEqual([])
  })

  it('verträgt leere Eingaben und ein Limit von 0', () => {
    expect(recentCategoryIds([], 5)).toEqual([])
    expect(recentCategoryIds([{ categoryId: 'a', at: '2026-08-04T10:00:00.000Z' }], 0)).toEqual([])
  })
})
