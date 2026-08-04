import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BADGE_CATALOG, BADGE_GROUPS } from '../shared/badges'

/**
 * STRUKTURELLER Test (F1 Stufe 4): jedes Abzeichen des Katalogs braucht Namen
 * und Bedingungstext — in BEIDEN Sprachen.
 *
 * Warum strukturell und nach dem Muster von notificationBellTexts: der Fehler,
 * gegen den er schützt, ist ein FEHLENDER Text, kein falscher. Ein Abzeichen
 * ohne Übersetzung zeigt in der Galerie seinen rohen Schlüssel
 * („posts.discussions.badges.name.great-reply") — eine Anzeige, die niemand
 * beim Bauen sieht, weil sie erst auftaucht, wenn jemand das Abzeichen
 * bekommt.
 *
 * DIE GEGENPROBE GEHÖRT DAZU: ein Text OHNE Abzeichen ist ein Rest, der beim
 * nächsten Umbenennen für einen fehlenden gehalten wird.
 */
const LOCALES = ['de', 'en'] as const

function messages(locale: (typeof LOCALES)[number]) {
  const path = resolve(import.meta.dirname, `../i18n/locales/${locale}.json`)
  return JSON.parse(readFileSync(path, 'utf8')).posts.discussions.badges as {
    name: Record<string, string>
    criterion: Record<string, string>
    group: Record<string, string>
  }
}

describe.each(LOCALES)('Abzeichen-Texte (%s)', (locale) => {
  const block = messages(locale)

  it('hat Namen und Bedingung für jedes Abzeichen', () => {
    for (const badge of BADGE_CATALOG) {
      expect(block.name[badge.key], `name.${badge.key}`).toBeTruthy()
      expect(block.criterion[badge.key], `criterion.${badge.key}`).toBeTruthy()
    }
  })

  it('hat keinen Text ohne Abzeichen', () => {
    const known = new Set(BADGE_CATALOG.map(badge => badge.key))
    expect(Object.keys(block.name).filter(key => !known.has(key))).toEqual([])
    expect(Object.keys(block.criterion).filter(key => !known.has(key))).toEqual([])
  })

  it('hat eine Überschrift für jede Gruppe', () => {
    for (const group of BADGE_GROUPS) {
      expect(block.group[group], `group.${group}`).toBeTruthy()
    }
    expect(Object.keys(block.group).sort()).toEqual([...BADGE_GROUPS].sort())
  })

  it('bringt keine spitzen Klammern mit', () => {
    // 2026-08-04 live erwischt: nuxt-i18n hält `<…>` für HTML, der
    // Nachrichten-Compiler steigt auf dem CLIENT aus, und ab da stehen im
    // Browser rohe Schlüssel. Typecheck, Lint und Unit-Tests sehen davon
    // nichts — außer diesem hier.
    for (const [key, value] of Object.entries({ ...block.name, ...block.criterion, ...block.group })) {
      expect(value, key).not.toMatch(/[<>]/)
    }
  })
})
