import { describe, expect, it } from 'vitest'
import {
  TOPIC_STATE_FIELDS,
  decideTopicStateChange,
  isTopicStateField,
  topicAcceptsWrites,
} from '../shared/topicState'

const AUTHOR = 'user-author'
const OTHER = 'user-other'

/** Ein veröffentlichtes Thema des Autors — der Normalfall. */
const published = { authorId: AUTHOR, status: 'published' }

describe('Katalog', () => {
  it('kennt genau die drei Zustände', () => {
    expect([...TOPIC_STATE_FIELDS]).toEqual(['pinned', 'closed', 'solved'])
  })

  it('weist Fremdes ab — auch `status`-Werte, die wie Zustände aussehen', () => {
    // Das ist die Modell-Entscheidung als Test: 'hidden' und 'archived' sind
    // KEINE Themen-Zustände. Ersteres gehört in `status`, Letzteres gibt es
    // hier gar nicht (Discourse-Katalog, bewusst nicht erfunden).
    for (const value of ['hidden', 'published', 'archived', 'wiki', '', 7, null, undefined]) {
      expect(isTopicStateField(value)).toBe(false)
    }
    expect(isTopicStateField('pinned')).toBe(true)
  })
})

describe('decideTopicStateChange — anheften und schließen sind Moderation', () => {
  it('ein Moderator darf beides', () => {
    for (const field of ['pinned', 'closed'] as const) {
      expect(decideTopicStateChange(field, { userId: OTHER, canModerate: true }, published))
        .toEqual({ allowed: true })
    }
  })

  it('der AUTOR darf sein Thema NICHT selbst anheften oder schließen', () => {
    // Sonst pinnt sich jeder sein eigenes Thema nach oben — das Anheften ordnet
    // den Raum für alle und gehört deshalb der Moderation.
    for (const field of ['pinned', 'closed'] as const) {
      expect(decideTopicStateChange(field, { userId: AUTHOR, canModerate: false }, published))
        .toEqual({ allowed: false, reason: 'not_allowed' })
    }
  })

  it('ein Fremder ohne Rechte darf gar nichts', () => {
    for (const field of TOPIC_STATE_FIELDS) {
      expect(decideTopicStateChange(field, { userId: OTHER, canModerate: false }, published))
        .toEqual({ allowed: false, reason: 'not_allowed' })
    }
  })
})

describe('decideTopicStateChange — „gelöst" ist die Frage-Sicht', () => {
  it('der Autor darf sein eigenes Thema als gelöst markieren, ohne Moderator zu sein', () => {
    expect(decideTopicStateChange('solved', { userId: AUTHOR, canModerate: false }, published))
      .toEqual({ allowed: true })
  })

  it('ein Moderator darf es auch — sonst bliebe ein Thema ohne Autor für immer ungelöst', () => {
    expect(decideTopicStateChange('solved', { userId: OTHER, canModerate: true }, published))
      .toEqual({ allowed: true })
  })

  it('GEGENPROBE: ein nicht angemeldeter Aufrufer ist NIE der Autor', () => {
    // userId '' darf nicht zufällig auf einen leeren authorId passen — das wäre
    // ein Gast, der fremde Themen als gelöst markiert.
    expect(decideTopicStateChange('solved', { userId: '', canModerate: false }, { authorId: '', status: 'published' }))
      .toEqual({ allowed: false, reason: 'not_allowed' })
  })
})

describe('decideTopicStateChange — nur veröffentlichte Themen haben Zustände', () => {
  it('geplant, ausgeblendet und gelöscht werden abgelehnt', () => {
    for (const status of ['scheduled', 'hidden', 'deleted']) {
      expect(decideTopicStateChange('pinned', { userId: OTHER, canModerate: true }, { authorId: AUTHOR, status }))
        .toEqual({ allowed: false, reason: 'not_published' })
    }
  })

  it('DIE REIHENFOLGE ZÄHLT: fehlende Rechte schlagen den Zustand', () => {
    // Sonst verriete ein 409 einem Unbefugten, dass es die Zeile gibt und in
    // welchem Zustand sie ist.
    expect(decideTopicStateChange('pinned', { userId: OTHER, canModerate: false }, { authorId: AUTHOR, status: 'hidden' }))
      .toEqual({ allowed: false, reason: 'not_allowed' })
  })
})

describe('topicAcceptsWrites', () => {
  it('offen heißt: es darf geschrieben werden', () => {
    expect(topicAcceptsWrites({ closed: false })).toBe(true)
  })

  it('geschlossen heißt: nicht mehr', () => {
    expect(topicAcceptsWrites({ closed: true })).toBe(false)
  })
})
