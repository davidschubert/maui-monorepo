import { describe, expect, it } from 'vitest'
import { decidePostAuthorAction, type PostAuthorActionInput } from '../shared/postAuthorPolicy'
import type { PostStatus } from '../shared/types/post'

/**
 * C16 — die Autoren-Regel stand dreimal im Code (patch-Route, delete-Route,
 * PostCard-Menü). Diese Suite hält fest, was an EINER Stelle gilt:
 *
 *  1. Nur der Autor. Ein Gast (kein userId) ist nie Autor.
 *  2. Bearbeiten nur, solange der Beitrag published/scheduled ist.
 *  3. Umfragen sind ab der ersten FREMDEN Stimme eingefroren — und ohne
 *     Zählung (Client-Sicht) gilt konservativ „eingefroren".
 *  4. Löschen darf der Autor immer, auch einen schon gelöschten Beitrag
 *     (die Route antwortet dann idempotent).
 */

const AUTHOR = 'user-author'
const STRANGER = 'user-stranger'

const post = (over: Partial<PostAuthorActionInput> = {}): PostAuthorActionInput => ({
  authorId: AUTHOR,
  status: 'published',
  type: 'post',
  ...over,
})

const ALL_STATUS: PostStatus[] = ['scheduled', 'published', 'hidden', 'deleted']

describe('Nur der Autor', () => {
  it('erkennt den Autor und gibt ihm beide Aktionen', () => {
    expect(decidePostAuthorAction(post(), AUTHOR))
      .toEqual({ isAuthor: true, canEdit: true, canDelete: true, reason: null })
  })

  it('weist einen Fremden auf JEDEM Status ab — mit not_author, nicht mit not_editable', () => {
    for (const status of ALL_STATUS) {
      expect(decidePostAuthorAction(post({ status }), STRANGER), status)
        .toEqual({ isAuthor: false, canEdit: false, canDelete: false, reason: 'not_author' })
    }
  })

  it('weist Gäste ab (null, undefined, leerer String)', () => {
    for (const userId of [null, undefined, '']) {
      expect(decidePostAuthorAction(post(), userId), String(userId))
        .toEqual({ isAuthor: false, canEdit: false, canDelete: false, reason: 'not_author' })
    }
  })

  it('macht einen Gast nicht zum Autor, wenn die Row selbst keine authorId trägt', () => {
    expect(decidePostAuthorAction(post({ authorId: '' }), '').isAuthor).toBe(false)
    expect(decidePostAuthorAction(post({ authorId: '' }), null).isAuthor).toBe(false)
  })
})

describe('Bearbeiten hängt am Status', () => {
  it('erlaubt published und scheduled', () => {
    for (const status of ['published', 'scheduled'] as const) {
      expect(decidePostAuthorAction(post({ status }), AUTHOR).canEdit, status).toBe(true)
    }
  })

  it('verweigert hidden und deleted mit not_editable', () => {
    for (const status of ['hidden', 'deleted'] as const) {
      expect(decidePostAuthorAction(post({ status }), AUTHOR), status)
        .toEqual({ isAuthor: true, canEdit: false, canDelete: true, reason: 'not_editable' })
    }
  })

  it('deckt die ganze Status-Liste ab (neuer Status ⇒ dieser Test bricht)', () => {
    const verdicts = Object.fromEntries(
      ALL_STATUS.map(status => [status, decidePostAuthorAction(post({ status }), AUTHOR).canEdit]),
    )
    expect(verdicts).toEqual({ scheduled: true, published: true, hidden: false, deleted: false })
  })
})

describe('Löschen bleibt dem Autor immer', () => {
  it('erlaubt es auf jedem Status — auch auf einem bereits gelöschten Beitrag', () => {
    for (const status of ALL_STATUS) {
      expect(decidePostAuthorAction(post({ status }), AUTHOR).canDelete, status).toBe(true)
    }
  })

  it('erlaubt es auch bei einer gesperrten Umfrage (die Sperre gilt nur dem Text)', () => {
    const decision = decidePostAuthorAction(post({ type: 'poll', hasForeignPollVotes: true }), AUTHOR)
    expect(decision.canDelete).toBe(true)
    expect(decision.canEdit).toBe(false)
  })
})

describe('Umfragen frieren mit der ersten fremden Stimme ein', () => {
  it('bleibt änderbar, solange NUR die eigene (oder gar keine) Stimme da ist', () => {
    expect(decidePostAuthorAction(post({ type: 'poll', hasForeignPollVotes: false }), AUTHOR))
      .toEqual({ isAuthor: true, canEdit: true, canDelete: true, reason: null })
  })

  it('sperrt mit poll_locked, sobald eine fremde Stimme existiert', () => {
    expect(decidePostAuthorAction(post({ type: 'poll', hasForeignPollVotes: true }), AUTHOR))
      .toEqual({ isAuthor: true, canEdit: false, canDelete: true, reason: 'poll_locked' })
  })

  it('sperrt UNGEZÄHLT (Client-Sicht: kein hasForeignPollVotes) konservativ ebenfalls', () => {
    expect(decidePostAuthorAction(post({ type: 'poll' }), AUTHOR).reason).toBe('poll_locked')
  })

  it('lässt post und question von der Poll-Sperre unberührt — auch ungezählt', () => {
    for (const type of ['post', 'question'] as const) {
      expect(decidePostAuthorAction(post({ type }), AUTHOR).canEdit, type).toBe(true)
      expect(decidePostAuthorAction(post({ type, hasForeignPollVotes: true }), AUTHOR).canEdit, type).toBe(true)
    }
  })

  it('meldet bei einer nicht editierbaren Umfrage den STATUS zuerst (Reihenfolge der Route: 409 „not editable" vor der Stimmen-Zählung)', () => {
    expect(decidePostAuthorAction(post({ type: 'poll', status: 'hidden', hasForeignPollVotes: true }), AUTHOR).reason)
      .toBe('not_editable')
  })
})
