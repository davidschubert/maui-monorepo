import { describe, it, expect } from 'vitest'
import {
  DISCUSSIONS_BASE,
  MAX_TOPIC_SLUG,
  TOPIC_SLUG_FALLBACK,
  discussionCategoryPath,
  discussionTopicPath,
  resolveCanonicalTopicRoute,
  slugify,
  topicSlug,
} from '../shared/discussionUrl'

describe('slugify', () => {
  it('macht aus einem Titel ein URL-Segment', () => {
    expect(slugify('Polipoli open yet?')).toBe('polipoli-open-yet')
  })

  it('schreibt deutsche Umlaute aus statt sie zu verschlucken', () => {
    // Gegenprobe zur naiven NFD-Lösung: die hätte 'gr-e' geliefert.
    expect(slugify('Grüße aus Köln')).toBe('gruesse-aus-koeln')
    expect(slugify('Straße')).toBe('strasse')
  })

  it('entfernt sonstige diakritische Zeichen, statt sie zu Bindestrichen zu machen', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme')
  })

  it('lässt weder führende noch abschließende noch doppelte Bindestriche stehen', () => {
    expect(slugify('  ---Hallo   Welt!!!  ')).toBe('hallo-welt')
  })

  it('liefert leer, wenn nichts slug-fähig ist (der Rückfall liegt in topicSlug)', () => {
    expect(slugify('🎉🎉🎉')).toBe('')
    expect(slugify('')).toBe('')
  })

  it('kürzt auf die Obergrenze und endet nie auf einem Bindestrich', () => {
    const slug = slugify(`${'a'.repeat(78)} bcdefg`)
    expect(slug.length).toBeLessThanOrEqual(MAX_TOPIC_SLUG)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('topicSlug', () => {
  it('nimmt den Titel, wenn es einen gibt', () => {
    expect(topicSlug('Wie geht das?', 'irgendein Text')).toBe('wie-geht-das')
  })

  it('fällt auf den Text zurück — Fragen und Umfragen haben oft keinen Titel', () => {
    expect(topicSlug(null, 'Welche Farbe soll der Verein tragen?')).toBe('welche-farbe-soll-der-verein-tragen')
    expect(topicSlug('', 'Nur Text')).toBe('nur-text')
  })

  it('fällt zuletzt auf den Platzhalter zurück, nie auf ein leeres Segment', () => {
    expect(topicSlug('🎉', '🎉')).toBe(TOPIC_SLUG_FALLBACK)
  })
})

describe('Pfade', () => {
  it('baut Kategorie- und Topic-Pfad ohne Locale-Prefix', () => {
    expect(discussionCategoryPath('pukalani')).toBe(`${DISCUSSIONS_BASE}/pukalani`)
    expect(discussionTopicPath('pukalani', '1v7ornq', 'polipoli-open-yet'))
      .toBe('/discussions/pukalani/1v7ornq/polipoli-open-yet')
  })
})

describe('resolveCanonicalTopicRoute — die 301-Regel', () => {
  const canonical = { canonicalCategory: 'pukalani', canonicalSlug: 'polipoli-open-yet', id: '1v7ornq' }

  it('lässt die kanonische URL rendern', () => {
    expect(resolveCanonicalTopicRoute({
      ...canonical, requestedCategory: 'pukalani', requestedSlug: 'polipoli-open-yet',
    })).toEqual({ ok: true })
  })

  it('leitet um, wenn der Slug veraltet ist (Titel wurde geändert)', () => {
    expect(resolveCanonicalTopicRoute({
      ...canonical, requestedCategory: 'pukalani', requestedSlug: 'alter-titel',
    })).toEqual({ ok: false, to: '/discussions/pukalani/1v7ornq/polipoli-open-yet' })
  })

  it('leitet um, wenn die Kategorie veraltet ist (Topic wurde umkategorisiert)', () => {
    expect(resolveCanonicalTopicRoute({
      ...canonical, requestedCategory: 'gsap', requestedSlug: 'polipoli-open-yet',
    })).toEqual({ ok: false, to: '/discussions/pukalani/1v7ornq/polipoli-open-yet' })
  })

  it('leitet um, wenn BEIDE Deko-Segmente veraltet sind', () => {
    expect(resolveCanonicalTopicRoute({
      ...canonical, requestedCategory: 'gsap', requestedSlug: 'alter-titel',
    })).toEqual({ ok: false, to: '/discussions/pukalani/1v7ornq/polipoli-open-yet' })
  })

  it('behandelt Groß-/Kleinschreibung als nicht-kanonisch (ein Topic, eine URL)', () => {
    expect(resolveCanonicalTopicRoute({
      ...canonical, requestedCategory: 'Pukalani', requestedSlug: 'polipoli-open-yet',
    })).toEqual({ ok: false, to: '/discussions/pukalani/1v7ornq/polipoli-open-yet' })
  })

  it('leitet NIE auf sich selbst — sonst gäbe es eine Endlosschleife', () => {
    const decision = resolveCanonicalTopicRoute({
      ...canonical, requestedCategory: 'gsap', requestedSlug: 'alter-titel',
    })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    const again = resolveCanonicalTopicRoute({
      ...canonical, requestedCategory: 'pukalani', requestedSlug: 'polipoli-open-yet',
    })
    expect(again).toEqual({ ok: true })
    expect(decision.to).toBe(discussionTopicPath('pukalani', '1v7ornq', 'polipoli-open-yet'))
  })
})
