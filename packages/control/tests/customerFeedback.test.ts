import { describe, expect, it } from 'vitest'
import {
  ANONYMOUS_ACTOR,
  FEEDBACK_SERVICE_PATHS,
  actorCanParticipate,
  decideModerate,
  decideParticipate,
  decideSubmit,
  deriveFeedbackTitle,
  feedbackVisibleFor,
  projectFeedbackEntry,
  sortFeedbackEntries,
  trendingScore,
  voterKeyFor,
  type CustomerFeedbackRow,
  type FeedbackActor,
} from '../shared/customerFeedback'
import { feedbackSubmitSchema, feedbackUpdateSchema } from '../schemas/customerFeedback'

/**
 * Die Regeln des zentralen Kunden-Feedbacks (E10). Sie werden hier geprüft und
 * nicht in einer Route, weil sie DIE Datenschutz-Zusage aus Davids
 * Entscheidung 2 tragen: „Text für alle, Herkunft nur für den Betreiber".
 * Fiele `origin` versehentlich in die Antwort, sähe man es der Oberfläche
 * nicht an — ein Test ist hier die einzige Stelle, an der es auffällt.
 */

const NOW = Date.parse('2026-07-31T12:00:00.000Z')

function row(overrides: Partial<CustomerFeedbackRow> = {}): CustomerFeedbackRow {
  return {
    $id: 'f1',
    $sequence: 1,
    $tableId: 'customer_feedback',
    $databaseId: 'db',
    $createdAt: '2026-07-31T10:00:00.000Z',
    $updatedAt: '2026-07-31T10:00:00.000Z',
    $permissions: [],
    area: 'core',
    productKey: '',
    title: 'Bitte dunkles Design',
    message: 'Bitte dunkles Design\nfür die Übersicht.',
    state: 'under_review',
    status: 'visible',
    page: '/dashboard',
    communityId: 'c1',
    communityName: 'Morgenlicht',
    runtimeProjectId: 'pool',
    authorUserId: 'u1',
    authorName: 'Ada',
    authorEmail: 'ada@example.com',
    voteCount: 3,
    communityCount: 2,
    commentCount: 1,
    lastVoteAt: null,
    ...overrides,
  } as CustomerFeedbackRow
}

function actor(overrides: Partial<FeedbackActor> = {}): FeedbackActor {
  return {
    projectId: 'pool',
    userId: 'u2',
    name: 'Grace',
    email: 'grace@example.com',
    communityId: 'c2',
    communityName: 'Abendrot',
    isOperator: false,
    ...overrides,
  }
}

describe('voterKeyFor', () => {
  it('trägt das Projekt mit — gleiche User-Id in zwei Projekten sind zwei Menschen', () => {
    expect(voterKeyFor('pool', 'u1')).toBe('pool:u1')
    expect(voterKeyFor('silo-a', 'u1')).not.toBe(voterKeyFor('pool', 'u1'))
  })
})

describe('deriveFeedbackTitle', () => {
  it('nimmt die erste Zeile', () => {
    expect(deriveFeedbackTitle('Erste Zeile\nzweite Zeile')).toBe('Erste Zeile')
  })

  it('kappt lange Zeilen mit Auslassung', () => {
    const title = deriveFeedbackTitle('x'.repeat(400))
    expect(title.length).toBe(120)
    expect(title.endsWith('…')).toBe(true)
  })

  it('fällt auf einen Platzhalter zurück statt auf einen leeren Titel', () => {
    expect(deriveFeedbackTitle('\n\n  ')).toBe('Feedback')
  })
})

describe('trendingScore', () => {
  it('gewichtet Kommentare stärker als Stimmen', () => {
    const base = { createdAt: '2026-07-31T10:00:00.000Z' }
    const votes = trendingScore({ ...base, voteCount: 2, commentCount: 0 }, NOW)
    const comments = trendingScore({ ...base, voteCount: 0, commentCount: 2 }, NOW)
    expect(comments).toBeGreaterThan(votes)
  })

  it('lässt Älteres sinken — bei gleicher Zustimmung', () => {
    const fresh = trendingScore({ voteCount: 5, commentCount: 0, createdAt: '2026-07-31T11:00:00.000Z' }, NOW)
    const old = trendingScore({ voteCount: 5, commentCount: 0, createdAt: '2026-07-01T11:00:00.000Z' }, NOW)
    expect(fresh).toBeGreaterThan(old)
  })
})

describe('sortFeedbackEntries', () => {
  const entries = [
    { id: 'alt-viel', voteCount: 50, commentCount: 0, createdAt: '2026-06-01T10:00:00.000Z' },
    { id: 'neu-wenig', voteCount: 2, commentCount: 0, createdAt: '2026-07-31T11:30:00.000Z' },
    { id: 'mittel', voteCount: 10, commentCount: 3, createdAt: '2026-07-30T10:00:00.000Z' },
  ]

  it('new = jüngstes zuerst', () => {
    expect(sortFeedbackEntries(entries, 'new', NOW).map(e => e.id)).toEqual(['neu-wenig', 'mittel', 'alt-viel'])
  })

  it('top = meiste Stimmen zuerst', () => {
    expect(sortFeedbackEntries(entries, 'top', NOW).map(e => e.id)).toEqual(['alt-viel', 'mittel', 'neu-wenig'])
  })

  it('trending stellt das Junge vor das Alte-mit-vielen-Stimmen', () => {
    const order = sortFeedbackEntries(entries, 'trending', NOW).map(e => e.id)
    expect(order.indexOf('neu-wenig')).toBeLessThan(order.indexOf('alt-viel'))
  })

  it('sortiert nicht in-place (die Quelle bleibt unberührt)', () => {
    const source = [...entries]
    sortFeedbackEntries(source, 'top', NOW)
    expect(source.map(e => e.id)).toEqual(entries.map(e => e.id))
  })
})

describe('projectFeedbackEntry — Entscheidung 2 (Herkunft nur für den Betreiber)', () => {
  it('gibt einem gewöhnlichen Betrachter KEINE Herkunft und keine Seite', () => {
    const entry = projectFeedbackEntry(row(), { actor: actor(), hasVoted: false })
    expect(entry.origin).toBeNull()
    expect(entry.page).toBe('')
    expect(entry.message).toContain('dunkles Design')
  })

  it('gibt dem Betreiber Community, Verfasser und Adresse', () => {
    const entry = projectFeedbackEntry(row(), { actor: actor({ isOperator: true }), hasVoted: false })
    expect(entry.origin).toEqual({
      communityId: 'c1',
      communityName: 'Morgenlicht',
      runtimeProjectId: 'pool',
      authorUserId: 'u1',
      authorName: 'Ada',
      authorEmail: 'ada@example.com',
    })
    expect(entry.page).toBe('/dashboard')
  })

  it('verrät dem Verfasser NICHT die Herkunft, markiert den Eintrag aber als seinen', () => {
    const mine = projectFeedbackEntry(row(), { actor: actor({ userId: 'u1', projectId: 'pool' }), hasVoted: true })
    expect(mine.mine).toBe(true)
    expect(mine.origin).toBeNull()
    expect(mine.hasVoted).toBe(true)
  })

  it('hält gleiche User-Id aus einem ANDEREN Projekt nicht für den Verfasser', () => {
    const foreign = projectFeedbackEntry(row(), { actor: actor({ userId: 'u1', projectId: 'silo-a' }), hasVoted: false })
    expect(foreign.mine).toBe(false)
  })

  it('ein anonymer Betrachter ist nie „mine"', () => {
    const anon = projectFeedbackEntry(row({ authorUserId: '', runtimeProjectId: '' }), { actor: ANONYMOUS_ACTOR, hasVoted: false })
    expect(anon.mine).toBe(false)
  })
})

describe('feedbackVisibleFor — verstecken statt löschen (Entscheidung 8)', () => {
  const hidden = row({ status: 'hidden' })

  it('versteckt Fremden die Zeile', () => {
    expect(feedbackVisibleFor(hidden, actor())).toBe(false)
  })

  it('zeigt sie dem Betreiber', () => {
    expect(feedbackVisibleFor(hidden, actor({ isOperator: true }))).toBe(true)
  })

  it('zeigt sie dem Verfasser — „versteckt" darf für ihn nicht wie „weg" aussehen', () => {
    expect(feedbackVisibleFor(hidden, actor({ userId: 'u1', projectId: 'pool' }))).toBe(true)
  })

  it('sichtbare Zeilen sieht jeder, auch anonym', () => {
    expect(feedbackVisibleFor(row(), ANONYMOUS_ACTOR)).toBe(true)
  })
})

describe('Entscheidungen', () => {
  it('anonym darf senden (Entscheidung 4)', () => {
    expect(decideSubmit(ANONYMOUS_ACTOR, false)).toEqual({ ok: true })
  })

  it('anonym darf NICHT wählen oder kommentieren', () => {
    expect(actorCanParticipate(ANONYMOUS_ACTOR)).toBe(false)
    expect(decideParticipate(ANONYMOUS_ACTOR)).toEqual({ ok: false, reason: 'anonymous' })
  })

  it('eine stummgeschaltete Community kommt nicht durch (Entscheidung 8)', () => {
    expect(decideSubmit(actor(), true)).toEqual({ ok: false, reason: 'community_muted' })
  })

  it('die Stummschaltung trifft anonyme Absender nicht — sie haben keine Community', () => {
    expect(decideSubmit(ANONYMOUS_ACTOR, true)).toEqual({ ok: true })
  })

  it('verschieben und verstecken kann nur der Betreiber', () => {
    expect(decideModerate(actor())).toEqual({ ok: false, reason: 'operator_only' })
    expect(decideModerate(actor({ isOperator: true }))).toEqual({ ok: true })
  })
})

describe('Eingabe-Schemas', () => {
  it('verlangt bei „Ein Produkt" auch ein Produkt (Entscheidung 5)', () => {
    expect(feedbackSubmitSchema.safeParse({ area: 'product', message: 'Bitte Kurse verbessern' }).success).toBe(false)
    expect(feedbackSubmitSchema.safeParse({ area: 'product', productKey: 'courses', message: 'Bitte Kurse verbessern' }).success).toBe(true)
  })

  it('braucht bei den anderen Bereichen keines', () => {
    expect(feedbackSubmitSchema.safeParse({ area: 'billing', message: 'Rechnung unklar' }).success).toBe(true)
  })

  it('lehnt eine leere Betreiber-Änderung ab (jedes Feld optional, aber nicht alle)', () => {
    expect(feedbackUpdateSchema.safeParse({}).success).toBe(false)
    expect(feedbackUpdateSchema.safeParse({ state: 'planned' }).success).toBe(true)
  })
})

describe('Service-Pfade', () => {
  it('sind eindeutig und liegen alle unter /api/control/feedback/', () => {
    const paths = Object.values(FEEDBACK_SERVICE_PATHS)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(path.startsWith('/api/control/feedback/')).toBe(true)
  })
})
