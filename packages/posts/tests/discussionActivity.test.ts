import { describe, expect, it } from 'vitest'
import { topicActivityAt } from '../shared/discussionActivity'

/**
 * F1 Stufe 2 — die Rückfall-Kette der Spalte „Aktivität".
 *
 * Klein, aber sie trägt die eine Aussage, wegen der posts-009 überhaupt
 * existiert: `$updatedAt` ist der NOTNAGEL und nicht die Quelle.
 */

const UPDATED = '2026-08-04T12:00:00.000Z'
const PUBLISHED = '2026-08-01T09:00:00.000Z'
const ACTIVITY = '2026-08-03T18:30:00.000Z'

describe('topicActivityAt', () => {
  it('nimmt die nachgezogene Aktivität, sobald es sie gibt', () => {
    expect(topicActivityAt({ lastActivityAt: ACTIVITY, publishedAt: PUBLISHED, $updatedAt: UPDATED }))
      .toBe(ACTIVITY)
  })

  it('GEGENPROBE: schlägt $updatedAt NICHT, obwohl es NEUER ist', () => {
    // Der Kern der Sache. `$updatedAt` liegt hier drei Tage später als die
    // echte Aktivität — genau das passiert bei einer Stimme oder einem
    // Tippfehler-Fix. Gewönne der neuere Wert, wäre die Spalte wieder das,
    // was Stufe 1 hatte.
    expect(topicActivityAt({ lastActivityAt: ACTIVITY, publishedAt: PUBLISHED, $updatedAt: UPDATED }))
      .not.toBe(UPDATED)
  })

  it('fällt für BESTAND (noch kein Backfill) auf die Veröffentlichung zurück', () => {
    expect(topicActivityAt({ lastActivityAt: null, publishedAt: PUBLISHED, $updatedAt: UPDATED }))
      .toBe(PUBLISHED)
  })

  it('behandelt den leeren String wie „nicht gesetzt"', () => {
    // Appwrite liefert für eine nie beschriebene Datetime-Spalte null; ein
    // Fixture oder ein Roh-REST-Schreiber kann trotzdem '' hinterlassen. Beides
    // heißt dasselbe, und ein '' in der Oberfläche wäre eine leere Zelle.
    expect(topicActivityAt({ lastActivityAt: '', publishedAt: PUBLISHED, $updatedAt: UPDATED }))
      .toBe(PUBLISHED)
  })

  it('nimmt $updatedAt erst, wenn es sonst NICHTS gibt', () => {
    // Ein geplanter Beitrag: weder Aktivität noch Veröffentlichung. Er hat auf
    // der Topic-Liste zwar nichts zu suchen (die filtert auf 'published'), aber
    // die Funktion muss trotzdem immer einen Zeitstempel liefern — sonst
    // bräuchte jede Aufrufstelle eine Sonderbehandlung für „gar nichts".
    expect(topicActivityAt({ lastActivityAt: null, publishedAt: null, $updatedAt: UPDATED }))
      .toBe(UPDATED)
  })

  it('kommt auch mit ganz fehlenden Feldern zurecht', () => {
    expect(topicActivityAt({ $updatedAt: UPDATED })).toBe(UPDATED)
  })
})
