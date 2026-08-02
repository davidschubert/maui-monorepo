import { describe, expect, it } from 'vitest'
import { csrfOriginVerdict } from '../server/utils/csrfOrigin'

/**
 * Nacht-Audit 2026-08-02, F32: `Sec-Fetch-Site: same-site` durfte passieren.
 * Unter der Wildcard `*.pukalani.app` ist jeder Mandanten-Host same-site zu
 * jedem anderen — im Selbstbedienungs-Pool war das ein Cross-Tenant-CSRF-Weg,
 * sobald die Session nicht mehr per SameSite-Cookie geschützt ist (Embed E2).
 */
const HOST = 'kunde-a.pukalani.app'

describe('csrfOriginVerdict — cross-site', () => {
  it('cross-site fliegt raus, egal was im Origin steht', () => {
    expect(csrfOriginVerdict({ secFetchSite: 'cross-site', origin: 'https://boese.example', host: HOST })).toBe('reject')
    // Auch ein passend GEFÄLSCHTER Origin hilft nicht — der Browser hat schon geurteilt.
    expect(csrfOriginVerdict({ secFetchSite: 'cross-site', origin: `https://${HOST}`, host: HOST })).toBe('reject')
  })
})

describe('csrfOriginVerdict — same-origin', () => {
  it('passiert, auch OHNE Origin-Header', () => {
    // Gleichherkünftige Formular-POSTs kommen je nach Browser ohne Origin an;
    // ein Origin-Zwang würde echte Requests brechen, ohne etwas zu gewinnen.
    expect(csrfOriginVerdict({ secFetchSite: 'same-origin', origin: undefined, host: HOST })).toBe('allow')
    expect(csrfOriginVerdict({ secFetchSite: 'same-origin', origin: `https://${HOST}`, host: HOST })).toBe('allow')
  })

  it('das ist der EMBED-Fluss: iframe und Popup liegen auf der Widget-Origin', () => {
    // /embed → /api/comments/*, Popup → /api/auth/embed-handoff,
    // iframe → /api/auth/embed-session. Alle melden same-origin.
    const widget = 'comments.pukalani.app'
    for (const path of ['/api/auth/embed-handoff', '/api/auth/embed-session']) {
      expect(csrfOriginVerdict({ secFetchSite: 'same-origin', origin: `https://${widget}`, host: widget }), path).toBe('allow')
    }
  })
})

describe('csrfOriginVerdict — same-site (DER BEFUND)', () => {
  it('FREMDER Mandanten-Host unter derselben Wildcard: abgelehnt', () => {
    expect(csrfOriginVerdict({
      secFetchSite: 'same-site',
      origin: 'https://kunde-b.pukalani.app',
      host: HOST,
    })).toBe('reject')
    // Auch der Kontroll-Host ist nur ein Nachbar, kein Freibrief.
    expect(csrfOriginVerdict({
      secFetchSite: 'same-site',
      origin: 'https://control.pukalani.app',
      host: HOST,
    })).toBe('reject')
  })

  it('PASSENDER Origin (nur Schema unterscheidet sich) darf durch', () => {
    // http→https ist same-site, aber cross-origin; der Host stimmt überein.
    expect(csrfOriginVerdict({ secFetchSite: 'same-site', origin: `http://${HOST}`, host: HOST })).toBe('allow')
  })

  it('anderer PORT ist ein anderer Host — abgelehnt', () => {
    expect(csrfOriginVerdict({ secFetchSite: 'same-site', origin: 'http://localhost:3001', host: 'localhost:3000' })).toBe('reject')
    expect(csrfOriginVerdict({ secFetchSite: 'same-site', origin: 'http://localhost:3000', host: 'localhost:3000' })).toBe('allow')
  })

  it('same-site OHNE Origin ist ein Widerspruch — abgelehnt', () => {
    // same-site heißt cross-origin; ein Browser schickt dabei immer Origin.
    expect(csrfOriginVerdict({ secFetchSite: 'same-site', origin: undefined, host: HOST })).toBe('reject')
    expect(csrfOriginVerdict({ secFetchSite: 'same-site', origin: '', host: HOST })).toBe('reject')
  })

  it('unparsebarer Origin (sandboxed iframe schickt "null") — abgelehnt', () => {
    expect(csrfOriginVerdict({ secFetchSite: 'same-site', origin: 'null', host: HOST })).toBe('reject')
  })

  it('Präfix/Suffix-Tricks am Hostnamen greifen nicht', () => {
    for (const origin of [
      'https://kunde-a.pukalani.app.boese.example',
      'https://xkunde-a.pukalani.app',
      'https://kunde-a.pukalani.appx',
    ]) {
      expect(csrfOriginVerdict({ secFetchSite: 'same-site', origin, host: HOST }), origin).toBe('reject')
    }
  })
})

describe('csrfOriginVerdict — none', () => {
  it('Adresszeile/Lesezeichen: kein fremdes Dokument im Spiel', () => {
    expect(csrfOriginVerdict({ secFetchSite: 'none', origin: undefined, host: HOST })).toBe('allow')
  })
})

describe('csrfOriginVerdict — ohne Sec-Fetch-Site (alter Browser, Server-zu-Server)', () => {
  it('kein Origin → passieren (Stripe-Webhook, curl: kein Browser-Cookie)', () => {
    expect(csrfOriginVerdict({ secFetchSite: undefined, origin: undefined, host: HOST })).toBe('allow')
    expect(csrfOriginVerdict({ secFetchSite: '', origin: '', host: HOST })).toBe('allow')
  })

  it('passender Origin → passieren, fremder → abgelehnt', () => {
    expect(csrfOriginVerdict({ secFetchSite: undefined, origin: `https://${HOST}`, host: HOST })).toBe('allow')
    expect(csrfOriginVerdict({ secFetchSite: undefined, origin: 'https://kunde-b.pukalani.app', host: HOST })).toBe('reject')
    expect(csrfOriginVerdict({ secFetchSite: undefined, origin: 'null', host: HOST })).toBe('reject')
  })
})
