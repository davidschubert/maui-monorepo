import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  siteDomainStatusOf,
  websiteCanonicalHost,
  websiteFallbackHost,
  websiteKnownHosts,
} from '../shared/siteDomain'
import {
  acmeChallengeReachable,
  acmePreflightMessage,
  certificateOrderDecision,
  coveringCertificate,
  interpretAcmePreflight,
  normalizePloiConfig,
  siteCertificateDomains,
} from '../server/utils/ploi'
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

describe('certificateOrderDecision', () => {
  /**
   * F54-2: EINE Lesart der ploi-Liste für beide Wege. Vorher fragte der
   * Silo-Pfad nur nach AKTIVEN Zertifikaten und der Tenant-Pfad nach jedem
   * Status — zwei Antworten auf dieselbe Frage an derselben Liste, und genau
   * daran hing beim Erstlauf, dass nach einem Fehlschlag nicht mehr
   * nachbestellt wurde.
   *
   * Die Regel hat zwei Richtungen, und beide sind gleich wichtig: nicht
   * bestellen, solange ein Eintrag deckt (Let's Encrypt: fünf identische pro
   * Woche, der sechste sperrt sieben Tage) — und bestellen, sobald keiner mehr
   * deckt.
   */
  const wanted = ['portfolio.pukalani.app', 'www.pukalani.studio']
  const list = (certificates: { domain: string, status: string }[]) => ({ ok: true, certificates })

  it('bestellt, wenn KEIN Eintrag die Namensmenge deckt — die Nachbestellung', () => {
    expect(certificateOrderDecision(list([{ domain: 'portfolio.pukalani.app', status: 'active' }]), wanted))
      .toMatchObject({ order: true, reason: 'no_covering' })
  })

  it('bestellt auch, wenn ploi gar nichts führt', () => {
    expect(certificateOrderDecision(list([]), wanted)).toMatchObject({ order: true, reason: 'no_covering' })
  })

  it('schweigt bei einem aktiven deckenden Zertifikat', () => {
    expect(certificateOrderDecision(
      list([{ domain: 'WWW.Pukalani.Studio , portfolio.pukalani.app', status: 'active' }]),
      wanted,
    )).toMatchObject({ order: false, reason: 'active', message: '' })
  })

  it('hält bei einem Eintrag IN AUSSTELLUNG an und nennt Status und Ausweg', () => {
    const decision = certificateOrderDecision(
      list([{ domain: 'portfolio.pukalani.app,www.pukalani.studio', status: 'creating' }]),
      wanted,
    )
    expect(decision.order).toBe(false)
    expect(decision.status).toBe('creating')
    expect(decision.message).toContain('creating')
    expect(decision.message).toContain('erneut prüfen')
  })

  it('bestellt, wenn die Liste nicht lesbar ist (fail-open — ein Listen-Fehler blockiert nicht)', () => {
    expect(certificateOrderDecision({ ok: false, certificates: [] }, wanted))
      .toMatchObject({ order: true, reason: 'unreadable' })
  })

  it('bestellt NICHT für eine leere Wunschliste', () => {
    // coveringCertificate ist dort fail-closed (null), also „bestellen" —
    // aufgehalten wird das eine Ebene höher, wo `domains.length` geprüft wird.
    expect(certificateOrderDecision(list([]), []).order).toBe(true)
  })
})

describe('interpretAcmePreflight', () => {
  /**
   * F54-3: ploi's Alias-API pflegt den Port-80-Block der Site NICHT. Der neue
   * Name fällt dort in den 444-Catch-all, die HTTP-01-Prüfung kommt nie an —
   * und ein gescheiterter Antrag LÖSCHT die bestehende Lineage der Site
   * (live erwischt: `portfolio.pukalani.app` lief danach nur noch aus dem
   * nginx-Arbeitsspeicher, jeder Reload scheiterte still).
   *
   * Deshalb ist die Auslegung hier absichtlich grob: jede HTTP-Antwort zählt,
   * gar keine Antwort blockiert.
   */
  it('nimmt jede HTTP-Antwort als Ja — auch 404 und 301', () => {
    expect(interpretAcmePreflight({ kind: 'status', status: 404 })).toBe(true)
    expect(interpretAcmePreflight({ kind: 'status', status: 301 })).toBe(true)
    expect(interpretAcmePreflight({ kind: 'status', status: 200 })).toBe(true)
  })

  it('blockiert, wenn gar nichts zurückkommt', () => {
    expect(interpretAcmePreflight({ kind: 'error', detail: 'ECONNRESET' })).toBe(false)
    expect(interpretAcmePreflight({ kind: 'error', detail: 'UND_ERR_CONNECT_TIMEOUT' })).toBe(false)
  })

  it('sagt in der Meldung, was zu tun ist — nicht nur, was kaputt ist', () => {
    const message = acmePreflightMessage(['www.pukalani.studio (ECONNRESET)'])
    expect(message).toContain('www.pukalani.studio')
    expect(message).toContain('NICHTS bestellt')
    expect(message).toContain('nginx')
    expect(message).toContain('acme-challenge')
  })
})

describe('acmeChallengeReachable gegen einen echten Port 80', () => {
  /**
   * Kein gemocktes fetch: die Frage ist, ob ein STILLER Port als „nicht
   * erreichbar" ankommt. Ein Mock hätte genau das nicht zeigen können —
   * nginx' 444 ist kein Statuscode, sondern ein zugemachter Socket.
   */
  let answering: Server
  let silent: Server
  let answeringHost = ''
  let silentHost = ''

  beforeAll(async () => {
    answering = createServer((_req, res) => {
      res.statusCode = 404
      res.end('not found')
    })
    // Das 444-Double: Verbindung annehmen und ohne Antwort zumachen.
    silent = createServer(req => req.socket.destroy())
    await new Promise<void>(resolve => answering.listen(0, '127.0.0.1', resolve))
    await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve))
    answeringHost = `127.0.0.1:${(answering.address() as AddressInfo).port}`
    silentHost = `127.0.0.1:${(silent.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    for (const server of [answering, silent]) {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('lässt einen Namen durch, für den Port 80 antwortet', async () => {
    expect(await acmeChallengeReachable(answeringHost, 3000)).toEqual({ ok: true, detail: '404' })
  })

  it('blockiert einen Namen, dessen Verbindung stumm zugemacht wird (nginx 444)', async () => {
    const result = await acmeChallengeReachable(silentHost, 3000)
    expect(result.ok).toBe(false)
    expect(result.detail).not.toBe('')
  })

  it('blockiert einen Namen, für den überhaupt nichts lauscht', async () => {
    expect((await acmeChallengeReachable('127.0.0.1:9', 2000)).ok).toBe(false)
  })
})

describe('coveringCertificate', () => {
  /**
   * F52, Tenant-Pfad: hier zählt ANDERS als bei certificateCovers auch ein
   * Zertifikat, das noch in Ausstellung ist — genau während der Ausstellung
   * ist der Wiederholungs-Klick gefährlich (fünf identische pro Woche, der
   * sechste sperrt sieben Tage). Der Aufrufer entscheidet anhand des Status.
   */
  it('findet einen deckenden Eintrag unabhängig vom Status', () => {
    expect(coveringCertificate(
      [{ domain: 'kunde.example.com', status: 'creating' }],
      ['kunde.example.com'],
    )).toEqual({ domain: 'kunde.example.com', status: 'creating' })
  })

  it('ist unbeeindruckt von Leerraum und Groß-/Kleinschreibung', () => {
    expect(coveringCertificate(
      [{ domain: ' Kunde.Example.Com ', status: 'active' }],
      ['kunde.example.com'],
    )).toEqual({ domain: ' Kunde.Example.Com ', status: 'active' })
  })

  it('liefert null, wenn dem Eintrag ein gewünschter Name fehlt', () => {
    expect(coveringCertificate(
      [{ domain: 'kunde.example.com', status: 'active' }],
      ['kunde.example.com', 'www.kunde.example.com'],
    )).toBeNull()
  })

  it('liefert null für eine leere Wunschliste (fail-closed)', () => {
    expect(coveringCertificate([{ domain: 'a.example.com', status: 'active' }], [])).toBeNull()
  })
})

describe('normalizePloiConfig', () => {
  it('übersteht numerische Env-Werte — destr macht aus NUXT_PLOI_SERVER_ID=118713 eine ZAHL', () => {
    // Live erwischt 2026-08-07: `.trim()` auf der Zahl war ein 500 auf jeder
    // Route, die den Domain-Zustand rechnet — /dashboard/websites zeigte eine
    // leere Liste, und kein Tor hat es gesehen (die Tests liefen ohne
    // konfiguriertes ploi, wo der Zweig nie feuert).
    const config = normalizePloiConfig({ ploiToken: 'tok', ploiServerId: 118713, ploiSiteId: 390041 })
    expect(config.serverId).toBe('118713')
    expect(config.siteId).toBe('390041')
  })

  it('leere Werte bleiben leer — halbe Konfiguration ist keine', () => {
    const config = normalizePloiConfig({})
    expect(config.token).toBe('')
    expect(config.serverId).toBe('')
    expect(config.baseUrl).toBe('https://ploi.io/api')
  })
})
