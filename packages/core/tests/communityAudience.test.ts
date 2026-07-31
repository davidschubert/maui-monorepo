import { describe, it, expect } from 'vitest'
import { Permission, Role } from 'node-appwrite'
import {
  COMMUNITY_AUDIENCES,
  ROBOTS_NOINDEX,
  communityAudienceFor,
  communityContentIsPublic,
  communitySeoVisibilityFor,
  repermissionRow,
} from '../shared/communityAudience'
import type { TenantContext } from '../shared/types/tenant'

/**
 * C18 — Sichtbarkeit je Community (Davids Entscheidung 2026-07-30: wählbar,
 * Default öffentlich). Der Schalter ist nicht nur ein Feld: an DIESEN puren
 * Regeln hängen Row-Permissions, robots/sitemap/og und die Ansage im
 * Dashboard. Sie sind deshalb hier festgenagelt, nicht in einer Route.
 */

const poolOpen: TenantContext = { mode: 'pool', projectId: 'shared', tenantId: 't-1', communityId: 'siteAAA', audience: 'public' }
const poolClosed: TenantContext = { ...poolOpen, audience: 'members' }
const poolNoField: TenantContext = { mode: 'pool', projectId: 'shared', tenantId: 't-1', communityId: 'siteAAA' }

describe('communityAudienceFor', () => {
  it('liest den gesetzten Wert', () => {
    expect(communityAudienceFor(poolOpen)).toBe('public')
    expect(communityAudienceFor(poolClosed)).toBe('members')
  })
  it('KEIN Mandant / kein Feld → public (Silo, Kontroll-Host, Playground bleiben wie bisher)', () => {
    expect(communityAudienceFor(null)).toBe('public')
    expect(communityAudienceFor(undefined)).toBe('public')
    expect(communityAudienceFor(poolNoField)).toBe('public')
  })
  it('nur der exakte Wert members schließt — kein Raten an unbekannten Werten', () => {
    expect(communityAudienceFor({ ...poolOpen, audience: 'Members' as never })).toBe('public')
  })
})

describe('communityContentIsPublic / communitySeoVisibilityFor', () => {
  it('öffentlich: indexierbar, Sitemap listet, Vorschaubild an', () => {
    expect(communityContentIsPublic(poolOpen)).toBe(true)
    expect(communitySeoVisibilityFor(poolOpen)).toEqual({ indexable: true, sitemapListsUrls: true, ogImagePublic: true })
  })
  it('geschlossen: ALLE DREI zu — eine geschlossene Community mit offener Sitemap ist nicht geschlossen', () => {
    expect(communityContentIsPublic(poolClosed)).toBe(false)
    expect(communitySeoVisibilityFor(poolClosed)).toEqual({ indexable: false, sitemapListsUrls: false, ogImagePublic: false })
  })
  it('der robots-Wert schließt auch das Folgen aus', () => {
    expect(ROBOTS_NOINDEX).toBe('noindex, nofollow')
  })
})

describe('COMMUNITY_AUDIENCES', () => {
  // Die Gegenprobe gegen TENANT_AUDIENCES (die DB-Spalte) steht bewusst im
  // CONTROL-Test: core darf den control-Layer nicht kennen, auch nicht im Test
  // (A14). Siehe packages/control/tests/onboarding.test.ts.
  it('genau zwei Werte, members zuerst', () => {
    expect([...COMMUNITY_AUDIENCES]).toEqual(['members', 'public'])
  })
})

describe('repermissionRow — der Bestands-Umzug (PURE)', () => {
  const publicRead = Permission.read(Role.any())
  const membersRead = Permission.read(Role.label('siteAAA'))
  const owner = Permission.update(Role.user('u-1'))

  it('öffentlich → Mitglieder: die Veröffentlichungs-Permission wandert, der Rest bleibt', () => {
    expect(repermissionRow([publicRead, owner], { publicRead, membersRead, target: 'members' }))
      .toEqual([membersRead, owner])
  })
  it('Mitglieder → öffentlich: derselbe Weg zurück', () => {
    expect(repermissionRow([membersRead, owner], { publicRead, membersRead, target: 'public' }))
      .toEqual([publicRead, owner])
  })
  it('idempotent: schon richtig ⇒ null (kein zweiter Schreibvorgang)', () => {
    expect(repermissionRow([publicRead, owner], { publicRead, membersRead, target: 'public' })).toBeNull()
    expect(repermissionRow([membersRead], { publicRead, membersRead, target: 'members' })).toBeNull()
  })
  it('AUSGEBLENDETE/ENTWORFENE Zeilen bleiben zu — nichts wird aufgemacht', () => {
    expect(repermissionRow([owner], { publicRead, membersRead, target: 'public' })).toBeNull()
    expect(repermissionRow([], { publicRead, membersRead, target: 'public' })).toBeNull()
    // Eine Zeile, die nur Moderatoren sehen (Operator-Target), bleibt so.
    const modOnly = [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))]
    expect(repermissionRow(modOnly, { publicRead, membersRead, target: 'public' })).toBeNull()
  })
  it('Reste aus einem abgebrochenen Lauf (BEIDE Schreibweisen) werden auf eine reduziert', () => {
    expect(repermissionRow([publicRead, membersRead, owner], { publicRead, membersRead, target: 'members' }))
      .toEqual([membersRead, owner])
  })
  it('Reihenfolge bleibt: die neue Permission steht an der Stelle der alten', () => {
    expect(repermissionRow([owner, publicRead], { publicRead, membersRead, target: 'members' }))
      .toEqual([owner, membersRead])
  })
  it('ohne Ziel-Permission (Pool-Zeile ohne communityId) wird NICHT geraten', () => {
    expect(repermissionRow([publicRead], { publicRead, membersRead: '', target: 'members' })).toBeNull()
  })
  it('hin und zurück ergibt wieder den Ausgangszustand', () => {
    const start = [publicRead, owner]
    const closed = repermissionRow(start, { publicRead, membersRead, target: 'members' })!
    const reopened = repermissionRow(closed, { publicRead, membersRead, target: 'public' })!
    expect(reopened).toEqual(start)
  })
})
