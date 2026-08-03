import { describe, expect, it } from 'vitest'
import { pastDueNoticeRowId } from '../server/utils/pastDueNotice'

/**
 * „GENAU EINMAL" hängt an diesem Schlüssel — er IST der Merker (die Existenz der
 * Zeile, durchgesetzt von Appwrites 409). Deshalb wird er hier auf genau die
 * drei Eigenschaften festgenagelt, an denen der Mechanismus still kippen würde.
 *
 * Der Test importiert die Datei DIREKT (kein Nuxt-Kontext): `pastDueNoticeRowId`
 * hängt nur an node:crypto — das ist Absicht, damit dieser Beweis ohne
 * laufenden Server geführt werden kann.
 */

const COMMUNITY = 'abc123def456'
const SINCE = '2026-08-01T09:15:00.000Z'
const OWNER = 'owner-1'

describe('pastDueNoticeRowId', () => {
  it('ist stabil — derselbe Verzug meldet nur einmal', () => {
    expect(pastDueNoticeRowId(COMMUNITY, SINCE, OWNER)).toBe(pastDueNoticeRowId(COMMUNITY, SINCE, OWNER))
  })

  it('unterscheidet Verzugs-EPISODEN — wer bezahlt und später wieder offen ist, wird erneut gewarnt', () => {
    expect(pastDueNoticeRowId(COMMUNITY, SINCE, OWNER))
      .not.toBe(pastDueNoticeRowId(COMMUNITY, '2026-09-01T09:15:00.000Z', OWNER))
  })

  it('unterscheidet OWNER — sonst gewänne der erste das Rennen und der zweite bekäme nie etwas', () => {
    expect(pastDueNoticeRowId(COMMUNITY, SINCE, OWNER))
      .not.toBe(pastDueNoticeRowId(COMMUNITY, SINCE, 'owner-2'))
  })

  it('unterscheidet COMMUNITYS', () => {
    expect(pastDueNoticeRowId(COMMUNITY, SINCE, OWNER))
      .not.toBe(pastDueNoticeRowId('xyz789', SINCE, OWNER))
  })

  it('ist eine gültige Appwrite-Row-Id (≤36 Zeichen, kein führendes Sonderzeichen)', () => {
    const id = pastDueNoticeRowId(COMMUNITY, SINCE, OWNER)
    expect(id.length).toBeLessThanOrEqual(36)
    expect(id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
  })

  it('bleibt gültig, wenn die Community-Id die 36 Zeichen ausschöpft (deshalb gehasht)', () => {
    const id = pastDueNoticeRowId('c'.repeat(36), SINCE, 'o'.repeat(36))
    expect(id.length).toBeLessThanOrEqual(36)
  })
})
