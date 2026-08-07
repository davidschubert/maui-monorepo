import { describe, expect, it } from 'vitest'
import { canonicalRedirectStatus, canonicalRedirectTarget } from '../shared/canonicalHost'

/**
 * Die Umleitung auf die kanonische Adresse (control-035, Davids Entscheidung 2
 * vom 2026-08-07). Was hier schiefgeht, merkt man erst live: eine
 * Umleitungsschleife, ein verlorener Deep-Link, ein POST ohne Rumpf.
 */

describe('canonicalRedirectTarget', () => {
  /**
   * DIE WICHTIGSTE ZEILE: der kanonische Host leitet NICHT um. Ohne sie gäbe
   * es eine Endlosschleife, und zwar auf der Adresse, unter der die Community
   * wirklich zu Hause ist.
   */
  it('der kanonische Host leitet nicht um', () => {
    expect(canonicalRedirectTarget('www.kunde.de', 'www.kunde.de', '/feed')).toBeNull()
  })

  it('leitet von der Geschwister-Form auf die kanonische um', () => {
    expect(canonicalRedirectTarget('kunde.de', 'www.kunde.de', '/feed')).toBe('https://www.kunde.de/feed')
  })

  it('leitet von der Subdomain auf die eigene Domain um', () => {
    expect(canonicalRedirectTarget('kunde.pukalani.app', 'www.kunde.de', '/')).toBe('https://www.kunde.de/')
  })

  /** Der Pfad MIT Query reist mit — sonst wird aus jedem Einladungs-Link
   *  `?code=…` eine Sackgasse. */
  it('nimmt Pfad und Query mit', () => {
    expect(canonicalRedirectTarget('kunde.de', 'www.kunde.de', '/join?token=abc&x=1'))
      .toBe('https://www.kunde.de/join?token=abc&x=1')
  })

  it('ohne kanonischen Host passiert nichts (Silo, Kontroll-Host, Playground)', () => {
    expect(canonicalRedirectTarget('kunde.de', undefined, '/')).toBeNull()
    expect(canonicalRedirectTarget('kunde.de', '', '/')).toBeNull()
    expect(canonicalRedirectTarget('', 'www.kunde.de', '/')).toBeNull()
  })

  it('vergleicht ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    expect(canonicalRedirectTarget('WWW.Kunde.de', 'www.kunde.de', '/')).toBeNull()
  })

  it('setzt einen fehlenden führenden Schrägstrich', () => {
    expect(canonicalRedirectTarget('kunde.de', 'www.kunde.de', 'feed')).toBe('https://www.kunde.de/feed')
  })
})

describe('canonicalRedirectStatus', () => {
  it('GET/HEAD bekommen 301 — Davids Entscheidung', () => {
    expect(canonicalRedirectStatus('GET')).toBe(301)
    expect(canonicalRedirectStatus('head')).toBe(301)
    expect(canonicalRedirectStatus(undefined)).toBe(301)
  })

  /**
   * Alles andere 308. Ein 301 lässt Browser die Methode auf GET wechseln — ein
   * Formular-POST auf die alte Adresse verlöre stillschweigend seinen Rumpf,
   * und der Nutzer sähe eine Seite statt einer Fehlermeldung.
   */
  it('schreibende Methoden bekommen 308 und behalten damit ihren Rumpf', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(canonicalRedirectStatus(method)).toBe(308)
    }
  })
})
