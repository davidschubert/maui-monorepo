import { describe, expect, it } from 'vitest'
import {
  EMPTY_TOPIC_FILTERS,
  TOPIC_SOLUTION_FILTERS,
  TOPIC_STATE_FILTERS,
  activeTopicFilterCount,
  parseTopicFilters,
} from '../shared/discussionFilters'

const now = new Date('2026-08-04T14:30:00.000Z')

describe('Katalog', () => {
  it('kennt genau die zwei Achsen und ihre Werte', () => {
    // ZWEI Achsen statt Discourse' einer Liste — nur so ist „offen UND
    // ungelöst" überhaupt formulierbar.
    expect([...TOPIC_STATE_FILTERS]).toEqual(['any', 'open', 'closed'])
    expect([...TOPIC_SOLUTION_FILTERS]).toEqual(['any', 'solved', 'unsolved'])
  })
})

describe('parseTopicFilters — leerer Query heißt: keine Filter', () => {
  it('liefert die Grundstellung', () => {
    expect(parseTopicFilters({}, now)).toEqual(EMPTY_TOPIC_FILTERS)
  })

  it('ignoriert Unsinn, statt die öffentliche Liste mit 400 abzuschießen', () => {
    const parsed = parseTopicFilters({
      state: 'archived',
      solution: 'maybe',
      'created-after': 'gestern',
      'created-before': '2026-02-30',
      author: 'nicht; erlaubt',
      pinned: 'vielleicht',
      q: 42,
    }, now)

    expect(parsed).toEqual(EMPTY_TOPIC_FILTERS)
  })
})

describe('parseTopicFilters — Zeitfenster', () => {
  it('nimmt beide Grenzen', () => {
    const parsed = parseTopicFilters({ 'created-after': '2026-01-01', 'created-before': '2026-02-01' }, now)
    expect(parsed.createdAfter).toBe('2026-01-01T00:00:00.000Z')
    expect(parsed.createdBefore).toBe('2026-02-01T00:00:00.000Z')
  })

  it('versteht bei „nachher" auch die relative Angabe', () => {
    expect(parseTopicFilters({ 'created-after': '7d' }, now).createdAfter).toBe('2026-07-28T14:30:00.000Z')
  })

  it('„vorher" ist bewusst NUR ein Datum — `7d` ergäbe dort keinen Sinn', () => {
    expect(parseTopicFilters({ 'created-before': '7d' }, now).createdBefore).toBeNull()
  })

  it('VERWIRFT ein umgedrehtes Fenster ganz, statt eine leere Liste zu liefern', () => {
    // Sonst sähe „nach März, vor Februar" aus, als gäbe es keine Themen —
    // statt zu zeigen, dass die Eingabe unmöglich ist.
    const parsed = parseTopicFilters({ 'created-after': '2026-03-01', 'created-before': '2026-02-01' }, now)
    expect(parsed.createdAfter).toBeNull()
    expect(parsed.createdBefore).toBeNull()
  })

  it('GEGENPROBE: derselbe Tag auf beiden Seiten trifft nie etwas und fällt deshalb auch weg', () => {
    const parsed = parseTopicFilters({ 'created-after': '2026-03-01', 'created-before': '2026-03-01' }, now)
    expect(parsed.createdAfter).toBeNull()
    expect(parsed.createdBefore).toBeNull()
  })
})

describe('parseTopicFilters — angeheftet', () => {
  it('nur die ausdrückliche 1 heißt ja', () => {
    expect(parseTopicFilters({ pinned: '1' }, now).pinnedOnly).toBe(true)
    expect(parseTopicFilters({ pinned: true }, now).pinnedOnly).toBe(true)
  })

  it('GEGENPROBE: `pinned=0` heißt NEIN (jeder nicht-leere String wäre truthy)', () => {
    expect(parseTopicFilters({ pinned: '0' }, now).pinnedOnly).toBe(false)
    expect(parseTopicFilters({ pinned: 'false' }, now).pinnedOnly).toBe(false)
  })
})

describe('parseTopicFilters — Autor', () => {
  it('nimmt eine Row-Id', () => {
    expect(parseTopicFilters({ author: '68a1f2c3d4e5f6a7b8c9' }, now).author).toBe('68a1f2c3d4e5f6a7b8c9')
  })

  it('weist alles ab, was keine Row-Id ist — auch zu langes', () => {
    for (const value of ['a'.repeat(37), 'user id', "' OR 1=1", '', 7, null]) {
      expect(parseTopicFilters({ author: value }, now).author).toBe('')
    }
  })
})

describe('parseTopicFilters — die beiden Achsen sind kombinierbar', () => {
  it('offen UND ungelöst — die Frage, auf die ein Forum wirklich wartet', () => {
    const parsed = parseTopicFilters({ state: 'open', solution: 'unsolved' }, now)
    expect(parsed.state).toBe('open')
    expect(parsed.solution).toBe('unsolved')
  })
})

describe('parseTopicFilters — Titel-Suche', () => {
  it('trimmt und klemmt auf 100 Zeichen', () => {
    expect(parseTopicFilters({ q: '  hallo  ' }, now).search).toBe('hallo')
    expect(parseTopicFilters({ q: 'x'.repeat(200) }, now).search).toHaveLength(100)
  })
})

describe('activeTopicFilterCount', () => {
  it('zählt nichts, wenn nichts gesetzt ist', () => {
    expect(activeTopicFilterCount(EMPTY_TOPIC_FILTERS)).toBe(0)
  })

  it('zählt jeden gesetzten Filter des Aufklapp-Bereichs', () => {
    const filters = parseTopicFilters({
      'created-after': '2026-01-01',
      'created-before': '2026-06-01',
      'author': 'abc',
      'pinned': '1',
      'state': 'open',
      'solution': 'unsolved',
    }, now)
    expect(activeTopicFilterCount(filters)).toBe(6)
  })

  it('Kategorie und Titel-Suche zählen NICHT mit — sie haben eigene, sichtbare Bedienelemente', () => {
    const filters = parseTopicFilters({ category: 'allgemein', q: 'hallo' }, now)
    expect(activeTopicFilterCount(filters)).toBe(0)
  })
})
