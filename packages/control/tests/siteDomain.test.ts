import { describe, expect, it } from 'vitest'
import {
  siteDomainStatusOf,
  websiteCanonicalHost,
  websiteFallbackHost,
  websiteKnownHosts,
} from '../shared/siteDomain'
import { certificateCovers, siteCertificateDomains } from '../server/utils/ploi'
import { CUSTOM_DOMAIN_STATUSES } from '../shared/customDomain'
import { SITE_DOMAIN_STATUSES } from '../../core/shared/types/siteDomain'

/**
 * Die puren Regeln der Silo-Domains (control-036).
 *
 * Was hier NICHT steht, ist Absicht: Validierung, www-Paar, TXT-Nachweis und
 * Zeige-Prüfung sind unverändert die des Pools und hängen an
 * `customDomain.test.ts`. Gäbe es sie hier noch einmal, gäbe es sie zweimal.
 */

describe('SITE_DOMAIN_STATUSES (core) ⇔ CUSTOM_DOMAIN_STATUSES (control)', () => {
  /**
   * DER WICHTIGSTE TEST DIESER DATEI. Der Silo bekommt seinen Status über die
   * Naht und BENENNT ihn nur (Übersetzung, Farbe, nächster Schritt); gerechnet
   * wird er im Control Plane. Die beiden Listen sind deshalb dieselbe Aussage
   * an zwei Orten — und genau so etwas läuft auseinander, sobald jemand eine
   * Stufe ergänzt. Dann bricht es HIER und nicht beim Kunden, dessen Seite
   * einen rohen Schlüssel anzeigt.
   */
  it('sind wertgleich und gleich sortiert', () => {
    expect([...SITE_DOMAIN_STATUSES]).toEqual([...CUSTOM_DOMAIN_STATUSES])
  })
})

describe('websiteFallbackHost', () => {
  it('nimmt den Hostnamen aus der appUrl — ohne Schema und ohne Port', () => {
    expect(websiteFallbackHost('https://portfolio.pukalani.app')).toBe('portfolio.pukalani.app')
    expect(websiteFallbackHost('https://portfolio.pukalani.app/dashboard')).toBe('portfolio.pukalani.app')
    // Der Port fällt weg, weil `normalizeHost` ihn auf der anderen Seite auch
    // abschneidet — sonst träfen sich Request-Host und Rückfall-Host nie.
    expect(websiteFallbackHost('http://localhost:3005')).toBe('localhost')
  })

  it('verträgt eine Eingabe ohne Schema', () => {
    expect(websiteFallbackHost('portfolio.pukalani.app')).toBe('portfolio.pukalani.app')
  })

  it('ist LEER, wenn es keine Adresse gibt — und das ist kein Randfall', () => {
    // Ohne Rückfall-Adresse darf NIE umgeleitet werden: man wüsste nicht, wovon.
    expect(websiteFallbackHost('')).toBe('')
    expect(websiteFallbackHost(null)).toBe('')
    expect(websiteFallbackHost(undefined)).toBe('')
  })
})

describe('siteDomainStatusOf', () => {
  it('liest fail-closed — unbekannt, leer und null heißen „keine Domain"', () => {
    expect(siteDomainStatusOf({ customDomainStatus: 'active' })).toBe('active')
    expect(siteDomainStatusOf({ customDomainStatus: null })).toBe('none')
    expect(siteDomainStatusOf({ customDomainStatus: '' })).toBe('none')
    expect(siteDomainStatusOf({ customDomainStatus: 'aktiv' })).toBe('none')
  })
})

describe('websiteCanonicalHost', () => {
  const appUrl = 'https://portfolio.pukalani.app'

  it('ist die Pukalani-Adresse, solange keine eigene Domain aktiv ist', () => {
    expect(websiteCanonicalHost({ appUrl })).toBe('portfolio.pukalani.app')
    expect(websiteCanonicalHost({ appUrl, customDomain: 'www.pukalani.studio', customDomainStatus: 'pending_cert' }))
      .toBe('portfolio.pukalani.app')
  })

  it('ist die eigene Domain, sobald sie aktiv ist', () => {
    expect(websiteCanonicalHost({ appUrl, customDomain: 'www.pukalani.studio', customDomainStatus: 'active' }))
      .toBe('www.pukalani.studio')
  })

  it('ist leer ohne appUrl — kein geratener Host', () => {
    expect(websiteCanonicalHost({ appUrl: '', customDomain: 'www.pukalani.studio', customDomainStatus: 'active' }))
      .toBe('')
  })
})

describe('websiteKnownHosts', () => {
  const appUrl = 'https://portfolio.pukalani.app'

  it('kennt vor der Freischaltung NUR die Pukalani-Adresse', () => {
    /**
     * DIE ZEILE, DIE DIE ERSTAKTIVIERUNG RETTET. Zwischen „eingetragen" und
     * „aktiv" läuft die HTTP-01-Prüfung von Let's Encrypt. Stünde die
     * wartende Domain hier drin, würde unsere eigene Middleware die
     * Challenge auf die Pukalani-Adresse umleiten und die Ausstellung
     * scheitern lassen.
     */
    expect(websiteKnownHosts({ appUrl, customDomain: 'www.pukalani.studio', customDomainStatus: 'pending_cert' }))
      .toEqual(['portfolio.pukalani.app'])
    expect(websiteKnownHosts({ appUrl, customDomain: 'www.pukalani.studio', customDomainStatus: 'pending_dns' }))
      .toEqual(['portfolio.pukalani.app'])
  })

  it('nimmt nach der Freischaltung beide Formen dazu', () => {
    expect(websiteKnownHosts({ appUrl, customDomain: 'www.pukalani.studio', customDomainStatus: 'active' }))
      .toEqual(['portfolio.pukalani.app', 'www.pukalani.studio', 'pukalani.studio'])
  })

  it('bildet kein Paar, wo es keins gibt (dritte Ebene)', () => {
    expect(websiteKnownHosts({ appUrl, customDomain: 'blog.kunde.de', customDomainStatus: 'active' }))
      .toEqual(['portfolio.pukalani.app', 'blog.kunde.de'])
  })

  it('ist leer, wenn es weder Adresse noch Domain gibt', () => {
    expect(websiteKnownHosts({ appUrl: '' })).toEqual([])
  })
})

describe('siteCertificateDomains', () => {
  /**
   * DIE REIHENFOLGE IST DIE AUSSAGE. certbot benennt eine Lineage nach dem
   * ERSTEN Namen; die Lineage der Silo-Site heißt heute
   * `portfolio.pukalani.app` und soll weiter so heißen. Und die Site-Domain
   * MUSS überhaupt enthalten sein — ein Zertifikat nur für die Kundendomain
   * nähme dem alten Host sein TLS, also genau dem Host, der laut Zusage
   * Rückfall bleibt.
   */
  it('stellt die Haupt-Domain der Site voran und hängt die neuen Namen an', () => {
    expect(siteCertificateDomains(
      { main: 'portfolio.pukalani.app', aliases: [] },
      ['www.pukalani.studio', 'pukalani.studio'],
    )).toEqual(['portfolio.pukalani.app', 'www.pukalani.studio', 'pukalani.studio'])
  })

  it('behält bestehende Aliasse — sonst verlören sie ihr Zertifikat', () => {
    expect(siteCertificateDomains(
      { main: 'portfolio.pukalani.app', aliases: ['alt.example.com'] },
      ['www.pukalani.studio'],
    )).toEqual(['portfolio.pukalani.app', 'alt.example.com', 'www.pukalani.studio'])
  })

  it('entfernt Dubletten und leere Einträge', () => {
    expect(siteCertificateDomains(
      { main: 'portfolio.pukalani.app', aliases: ['www.pukalani.studio'] },
      ['www.pukalani.studio'],
    )).toEqual(['portfolio.pukalani.app', 'www.pukalani.studio'])
    expect(siteCertificateDomains({ main: '', aliases: [] }, ['a.example.com']))
      .toEqual(['a.example.com'])
  })
})

describe('certificateCovers', () => {
  /**
   * Die Sperre gegen den Wiederholungs-Klick: Let's Encrypt lässt fünf
   * identische Zertifikate pro Woche zu, und „Prüfen" ist re-entrant. Wer
   * während der Ausstellung sechsmal klickt, sperrt sich sieben Tage aus.
   */
  const wanted = ['portfolio.pukalani.app', 'www.pukalani.studio']

  it('erkennt ein aktives Zertifikat, das alle Namen trägt', () => {
    expect(certificateCovers(
      [{ domain: 'portfolio.pukalani.app,www.pukalani.studio', status: 'active' }],
      wanted,
    )).toBe(true)
  })

  it('ist unbeeindruckt von Reihenfolge, Leerraum und Groß-/Kleinschreibung', () => {
    expect(certificateCovers(
      [{ domain: 'WWW.Pukalani.Studio , portfolio.pukalani.app', status: 'active' }],
      wanted,
    )).toBe(true)
  })

  it('zählt ein Zertifikat NICHT, dem ein Name fehlt', () => {
    expect(certificateCovers(
      [{ domain: 'portfolio.pukalani.app', status: 'active' }],
      wanted,
    )).toBe(false)
  })

  it('zählt ein nicht-aktives Zertifikat nicht', () => {
    expect(certificateCovers(
      [{ domain: 'portfolio.pukalani.app,www.pukalani.studio', status: 'pending' }],
      wanted,
    )).toBe(false)
  })

  it('deckt eine leere Wunschliste NICHT ab (fail-closed)', () => {
    expect(certificateCovers([{ domain: 'a.example.com', status: 'active' }], [])).toBe(false)
  })
})
