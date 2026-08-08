import { describe, expect, it } from 'vitest'
import { selectUsagePosts, usagePercent } from '../shared/communityUsage'

/**
 * Die pure Hälfte des Reiters „Speicher" (F51 Paket 2, 2026-08-07).
 *
 * Die Route `/api/community/usage` zählt nur (Datentür) und löst Kontingente
 * über `tenantLimitsFor()` auf — dieselbe Funktion, die auch die Bremse fragt.
 * WAS davon in die Antwort kommt, entscheidet `selectUsagePosts`, und genau
 * das ist hier festgenagelt: drei Auslass-Regeln, von denen jede einzeln eine
 * falsche Auskunft verhindert.
 */

const limits = (map: Record<string, { total?: number, perDay?: number }>) =>
  (kind: string) => map[kind]

describe('selectUsagePosts', () => {
  it('zeigt einen Posten mit Bestand und Kontingent', () => {
    expect(selectUsagePosts(
      [{ kind: 'comments', total: 12 }],
      limits({ comments: { total: 5000, perDay: 200 } }),
    )).toEqual([{ kind: 'comments', total: 12, limit: 5000 }])
  })

  it('lässt Posten OHNE Kontingent weg — „12 von unbegrenzt" ist keine Auskunft', () => {
    // Genau der Fall von `posts` und `courses`: der Haken steht an der Route,
    // der Katalog nennt keine Zahlen. Ein Balken ohne Dach wäre Zeilenrauschen.
    expect(selectUsagePosts(
      [{ kind: 'posts', total: 40 }, { kind: 'courses', total: 3 }],
      limits({ courses: {} }),
    )).toEqual([])
  })

  it('ignoriert ein reines Tageslimit', () => {
    // `perDay` ist eine rollierende 24-h-Zählung und bräuchte eine zweite
    // Abfrage; ein Balken, der ohne Zutun zurückläuft, verwirrt mehr, als er
    // erklärt. Wer heute zu schnell war, erfährt es an der Bremse.
    expect(selectUsagePosts(
      [{ kind: 'events', total: 7 }],
      limits({ events: { perDay: 50 } }),
    )).toEqual([])
  })

  it('lässt einen Posten weg, dessen Zählung fehlgeschlagen ist — 0 wäre gelogen', () => {
    // `null` heißt „Produkt nicht montiert oder Tabelle antwortet nicht". Eine
    // glatte 0 behauptete „du hast noch nichts angelegt".
    expect(selectUsagePosts(
      [{ kind: 'media', total: null }],
      limits({ media: { total: 300 } }),
    )).toEqual([])
  })

  it('sortiert nach Posten, nicht nach Registrierungs-Reihenfolge', () => {
    // Die Reihenfolge der Nitro-Plugins ist nichts, worauf sich eine Anzeige
    // stützen darf.
    expect(selectUsagePosts(
      [{ kind: 'media', total: 5 }, { kind: 'comments', total: 5 }, { kind: 'events', total: 5 }],
      limits({ media: { total: 300 }, comments: { total: 5000 }, events: { total: 1000 } }),
    ).map(p => p.kind)).toEqual(['comments', 'events', 'media'])
  })

  it('ein Limit von 0 zählt als unbegrenzt — dieselbe Lesart wie in der Bremse', () => {
    // `evaluateQuota` behandelt 0/fehlend als unbegrenzt. Hier dasselbe, sonst
    // stünde „12 von 0" auf der Seite und der Balken teilte durch null.
    expect(selectUsagePosts(
      [{ kind: 'comments', total: 12 }],
      limits({ comments: { total: 0 } }),
    )).toEqual([])
  })
})

describe('usagePercent', () => {
  it('rechnet den Anteil ganzzahlig', () => {
    expect(usagePercent({ kind: 'comments', total: 25, limit: 100 })).toBe(25)
    expect(usagePercent({ kind: 'comments', total: 1, limit: 3 })).toBe(33)
  })

  it('deckelt bei 100 — ein gesenktes Limit ist kein Anzeigefehler', () => {
    // Herabstufung oder geänderter Katalog: 400 von 300 ist ein voller Balken,
    // kein Balken über den Rand hinaus.
    expect(usagePercent({ kind: 'media', total: 400, limit: 300 })).toBe(100)
  })

  it('bleibt bei 0, wenn es kein Kontingent gibt', () => {
    expect(usagePercent({ kind: 'media', total: 5, limit: 0 })).toBe(0)
  })
})
