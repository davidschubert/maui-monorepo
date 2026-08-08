import { describe, expect, it } from 'vitest'
import { decideSiteRedirect, siteRedirectExemptPath } from '../shared/siteRedirect'

/**
 * Die vier Bedingungen der Silo-Umleitung (control-036) — jede einzeln, und
 * jede mit ihrer Gegenprobe. Ein Test, der nur den Erfolgsfall zeigt, würde
 * hier nichts beweisen: die Aussage dieses Moduls ist gerade, WANN es NICHTS
 * tut.
 */

const address = (canonicalHost: string, knownHosts: string[]) => ({ canonicalHost, knownHosts })

const LIVE = address('www.pukalani.studio', [
  'portfolio.pukalani.app',
  'www.pukalani.studio',
  'pukalani.studio',
])

describe('siteRedirectExemptPath', () => {
  it('lässt die HTTP-01-Antwort von Let\'s Encrypt durch', () => {
    expect(siteRedirectExemptPath('/.well-known/acme-challenge/abc123')).toBe(true)
  })

  it('lässt Health-Check und i18n-Selbstabruf durch', () => {
    expect(siteRedirectExemptPath('/api/health')).toBe(true)
    expect(siteRedirectExemptPath('/_i18n/de/messages.json')).toBe(true)
  })

  it('lässt Nuxts internen Fehlerseiten-Durchgang durch', () => {
    // Sonst macht jede 404 auf einem Ausnahme-Pfad doch noch eine Umleitung —
    // auf eine `__nuxt_error`-URL mit dem halben Stacktrace in der Query.
    expect(siteRedirectExemptPath('/__nuxt_error')).toBe(true)
  })

  it('… und sonst nichts', () => {
    expect(siteRedirectExemptPath('/')).toBe(false)
    expect(siteRedirectExemptPath('/api/site/domain')).toBe(false)
    // GEGENPROBE zur Präfix-Prüfung: ein Pfad, der nur so ANFÄNGT wie die
    // Ausnahme, ist keine (`/api/healthcheck` gehört der App).
    expect(siteRedirectExemptPath('/api/healthcheck')).toBe(false)
    expect(siteRedirectExemptPath('/well-known/x')).toBe(false)
  })

  it('sieht die Query nicht als Teil des Pfades an', () => {
    expect(siteRedirectExemptPath('/api/health?probe=1')).toBe(true)
  })
})

describe('decideSiteRedirect', () => {
  it('leitet die Pukalani-Adresse auf die eigene Domain um — mit Pfad UND Query', () => {
    const decision = decideSiteRedirect({
      host: 'portfolio.pukalani.app',
      path: '/cases/xyz?ref=mail',
      method: 'GET',
      address: LIVE,
    })
    expect(decision).toEqual({ target: 'https://www.pukalani.studio/cases/xyz?ref=mail', status: 301 })
  })

  it('leitet die Geschwister-Form auf die eingetragene um', () => {
    expect(decideSiteRedirect({ host: 'pukalani.studio', path: '/', method: 'GET', address: LIVE }))
      .toEqual({ target: 'https://www.pukalani.studio/', status: 301 })
  })

  it('lässt die kanonische Adresse in Ruhe — keine Schleife', () => {
    expect(decideSiteRedirect({ host: 'www.pukalani.studio', path: '/', method: 'GET', address: LIVE }))
      .toBeNull()
  })

  it('gibt schreibenden Methoden 308, damit der Rumpf nicht still verloren geht', () => {
    expect(decideSiteRedirect({ host: 'portfolio.pukalani.app', path: '/api/x', method: 'POST', address: LIVE })?.status)
      .toBe(308)
    expect(decideSiteRedirect({ host: 'portfolio.pukalani.app', path: '/', method: 'HEAD', address: LIVE })?.status)
      .toBe(301)
  })

  // ── Die drei Fälle, in denen NICHTS passieren darf ──────────────────────
  it('FAIL-SOFT: ohne Auskunft der Naht wird nicht umgeleitet', () => {
    expect(decideSiteRedirect({ host: 'portfolio.pukalani.app', path: '/', method: 'GET', address: null }))
      .toBeNull()
    // Auch eine Antwort OHNE kanonischen Host ist keine Erlaubnis.
    expect(decideSiteRedirect({
      host: 'portfolio.pukalani.app', path: '/', method: 'GET',
      address: address('', ['portfolio.pukalani.app']),
    })).toBeNull()
  })

  it('lässt fremde Hosts unberührt — sonst wäre die lokale Entwicklung kaputt', () => {
    for (const host of ['localhost', '127.0.0.1', 'vorschau.example.test']) {
      expect(decideSiteRedirect({ host, path: '/', method: 'GET', address: LIVE })).toBeNull()
    }
  })

  it('leitet die ACME-Antwort auch dann nicht um, wenn alles andere zutrifft', () => {
    expect(decideSiteRedirect({
      host: 'portfolio.pukalani.app',
      path: '/.well-known/acme-challenge/token',
      method: 'GET',
      address: LIVE,
    })).toBeNull()
  })

  it('tut nichts ohne Host-Header', () => {
    expect(decideSiteRedirect({ host: '', path: '/', method: 'GET', address: LIVE })).toBeNull()
  })
})
