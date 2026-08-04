import { describe, it, expect } from 'vitest'
import { categoryUpdateData } from '../shared/categoryPatch'

describe('categoryUpdateData — weggelassen heißt unverändert', () => {
  it('schreibt nur den Namen, wenn sonst nichts mitkommt', () => {
    expect(categoryUpdateData({ name: 'Allgemein' })).toEqual({ name: 'Allgemein' })
  })

  it('fasst „aktiv" NICHT an, wenn der Schalter nicht mitgeschickt wird', () => {
    // Der Fehler, der beim Bau live auftrat: ein Umbenennen hat eine
    // stillgelegte Kategorie wieder scharf geschaltet.
    const data = categoryUpdateData({ name: 'Umbenannt' })
    expect('active' in data).toBe(false)
  })

  it('fasst Reihenfolge und Beschreibung NICHT an, wenn sie fehlen', () => {
    const data = categoryUpdateData({ name: 'Umbenannt' })
    expect('sortOrder' in data).toBe(false)
    expect('description' in data).toBe(false)
  })

  it('schreibt ausdrücklich mitgeschickte LEERE Werte — die sind eine Ansage', () => {
    expect(categoryUpdateData({ name: 'X', description: '', sortOrder: 0, active: false })).toEqual({
      name: 'X', description: '', sortOrder: 0, active: false,
    })
  })

  it('schreibt gesetzte Werte unverändert durch', () => {
    expect(categoryUpdateData({ name: 'X', description: 'Text', sortOrder: 9, active: true })).toEqual({
      name: 'X', description: 'Text', sortOrder: 9, active: true,
    })
  })

  it('nimmt keinen Slug entgegen — er ist nach der Anlage fest', () => {
    const data = categoryUpdateData({ name: 'X', ...({ slug: 'geklaut' } as object) })
    expect('slug' in data).toBe(false)
  })
})
