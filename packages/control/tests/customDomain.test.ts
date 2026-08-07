import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CUSTOM_DOMAIN_MIN_PLAN,
  canonicalHostFor,
  customDomainAllowedForPlan,
  customDomainBase,
  customDomainCandidates,
  customDomainForms,
  customDomainIsLive,
  customDomainSibling,
  customDomainTokenPresent,
  customDomainVerifyRecordName,
  customDomainVerifyRecordValue,
  domainPointsToUs,
  isCustomDomainToken,
  isOperatorDomain,
  normalizeCustomDomain,
  resolveCustomDomainStatus,
  validateCustomDomain,
} from '../shared/customDomain'
import { isDryRunFlag } from '../server/utils/ploi'

/**
 * Die puren Regeln hinter eigenen Domains (control-035).
 *
 * Was hier NICHT getestet wird und auch nicht kann: echtes DNS, echte
 * Zertifikate, echtes ploi. Dafür gibt es den Live-Rundlauf
 * (packages/onboarding/scripts/verify-custom-domain.mjs) und das Runbook für
 * den ersten echten Kunden. Hier stehen die Entscheidungen, die man mit
 * Nachdenken beweisen kann — und ausgerechnet die halten die Sicherheit:
 * welche Eingabe abgelehnt wird, welcher Host kanonisch ist, wann ein Token
 * gilt.
 */

describe('normalizeCustomDomain', () => {
  it('macht aus einer getippten URL einen Hostnamen', () => {
    expect(normalizeCustomDomain('https://www.Beispiel.de/pfad?x=1#a')).toBe('www.beispiel.de')
    expect(normalizeCustomDomain('  HTTP://beispiel.de:8443  ')).toBe('beispiel.de')
    expect(normalizeCustomDomain('//beispiel.de')).toBe('beispiel.de')
    expect(normalizeCustomDomain('user:pw@beispiel.de')).toBe('beispiel.de')
  })

  it('entfernt den DNS-Wurzelpunkt', () => {
    expect(normalizeCustomDomain('beispiel.de.')).toBe('beispiel.de')
  })

  it('leere Eingaben bleiben leer', () => {
    expect(normalizeCustomDomain('')).toBe('')
    expect(normalizeCustomDomain(null)).toBe('')
    expect(normalizeCustomDomain(undefined)).toBe('')
  })
})

describe('validateCustomDomain', () => {
  it('nimmt gewöhnliche Kundendomains an', () => {
    expect(validateCustomDomain('www.pukalani.studio')).toEqual({ ok: true, domain: 'www.pukalani.studio' })
    expect(validateCustomDomain('pukalani.studio')).toEqual({ ok: true, domain: 'pukalani.studio' })
    expect(validateCustomDomain('xn--bcher-kva.de')).toEqual({ ok: true, domain: 'xn--bcher-kva.de' })
  })

  /**
   * DIE WICHTIGSTE PRÜFUNG DER DATEI. Ohne sie umginge eine Kundendomain die
   * Sperrliste RESERVED_SUBDOMAINS: der Wizard prüft nur das SLUG, hier kommt
   * ein VOLLER Host herein — `login.pukalani.app` in Kundenhand wäre eine
   * Anmeldedaten-Falle mit unserem Namen und gültigem Zertifikat.
   */
  it('lehnt JEDE Adresse unterhalb der Betreiber-Domain ab', () => {
    for (const host of ['pukalani.app', 'login.pukalani.app', 'my.pukalani.app', 'irgendwas.pukalani.app', 'a.b.pukalani.app']) {
      expect(validateCustomDomain(host)).toEqual({ ok: false, reason: 'operator_domain' })
    }
  })

  it('lehnt ab, was keine Domain ist', () => {
    expect(validateCustomDomain('localhost').reason).toBe('not_a_domain')
    expect(validateCustomDomain('192.168.0.1').reason).toBe('not_a_domain')
    expect(validateCustomDomain('beispiel.123').reason).toBe('not_a_domain')
    expect(validateCustomDomain('').reason).toBe('empty')
  })

  it('lehnt DNS-widrige Zeichen und Längen ab', () => {
    expect(validateCustomDomain('bücher.de').reason).toBe('invalid')
    expect(validateCustomDomain('-start.de').reason).toBe('invalid')
    expect(validateCustomDomain('ende-.de').reason).toBe('invalid')
    expect(validateCustomDomain('unter_strich.de').reason).toBe('invalid')
    expect(validateCustomDomain(`${'a'.repeat(64)}.de`).reason).toBe('invalid')
    expect(validateCustomDomain(`${'a'.repeat(60)}.`.repeat(5) + 'de').reason).toBe('too_long')
  })

  it('normalisiert vor dem Prüfen', () => {
    expect(validateCustomDomain('HTTPS://WWW.Beispiel.DE/')).toEqual({ ok: true, domain: 'www.beispiel.de' })
  })
})

describe('isOperatorDomain', () => {
  it('trennt uns von fremden Domains', () => {
    expect(isOperatorDomain('pukalani.app')).toBe(true)
    expect(isOperatorDomain('demo.pukalani.app')).toBe(true)
    // Kein Suffix-Trick: `nichtpukalani.app` endet NICHT auf `.pukalani.app`.
    expect(isOperatorDomain('nichtpukalani.app')).toBe(false)
    expect(isOperatorDomain('pukalani.studio')).toBe(false)
  })
})

describe('customDomainSibling / customDomainForms', () => {
  it('paart Apex und www', () => {
    expect(customDomainSibling('beispiel.de')).toBe('www.beispiel.de')
    expect(customDomainSibling('www.beispiel.de')).toBe('beispiel.de')
  })

  /**
   * Die bewusste GRENZE: für eine tiefere Subdomain bilden wir kein Paar.
   * Sonst würden wir ein Zertifikat für `www.blog.beispiel.de` beantragen, für
   * das niemand einen DNS-Eintrag angelegt hat — der Kunde bekäme einen Fehler
   * für einen Namen, den er nie wollte.
   */
  it('bildet für tiefere Subdomains kein Paar', () => {
    expect(customDomainSibling('blog.beispiel.de')).toBeNull()
    expect(customDomainForms('blog.beispiel.de')).toEqual(['blog.beispiel.de'])
  })

  it('nimmt der www-Form ihr www, auch tief', () => {
    expect(customDomainSibling('www.blog.beispiel.de')).toBe('blog.beispiel.de')
  })

  it('die EINGETRAGENE Form steht vorn — sie ist die kanonische', () => {
    expect(customDomainForms('www.beispiel.de')).toEqual(['www.beispiel.de', 'beispiel.de'])
    expect(customDomainForms('beispiel.de')).toEqual(['beispiel.de', 'www.beispiel.de'])
  })

  it('customDomainBase liegt immer ohne www', () => {
    expect(customDomainBase('www.beispiel.de')).toBe('beispiel.de')
    expect(customDomainBase('beispiel.de')).toBe('beispiel.de')
    expect(customDomainBase('blog.beispiel.de')).toBe('blog.beispiel.de')
  })
})

describe('customDomainCandidates', () => {
  it('findet die Zeile über BEIDE Formen', () => {
    expect(customDomainCandidates('beispiel.de')).toEqual(['beispiel.de', 'www.beispiel.de'])
    expect(customDomainCandidates('www.beispiel.de')).toEqual(['www.beispiel.de', 'beispiel.de'])
  })

  it('leerer Host ⇒ keine Kandidaten (der Resolver fragt dann gar nicht)', () => {
    expect(customDomainCandidates('')).toEqual([])
  })
})

describe('resolveCustomDomainStatus', () => {
  /**
   * FAIL-CLOSED wie `resolveTenantAudience`: an dieser Spalte hängt, welcher
   * HOST eine Community bedient. Eine Bestands-Zeile (null) darf nicht in
   * einen halbaktiven Zustand rutschen.
   */
  it('unbekannte Werte sind "none"', () => {
    expect(resolveCustomDomainStatus(null)).toBe('none')
    expect(resolveCustomDomainStatus(undefined)).toBe('none')
    expect(resolveCustomDomainStatus('')).toBe('none')
    expect(resolveCustomDomainStatus('tippfehler')).toBe('none')
  })

  it('kennt die fünf echten Stufen', () => {
    for (const value of ['pending_dns', 'pending_cert', 'pending_platform', 'active', 'error']) {
      expect(resolveCustomDomainStatus(value)).toBe(value)
    }
  })
})

describe('canonicalHostFor', () => {
  const base = { host: 'kunde.pukalani.app' }

  it('ohne eigene Domain gilt die Subdomain', () => {
    expect(canonicalHostFor(base)).toBe('kunde.pukalani.app')
    expect(canonicalHostFor({ ...base, customDomain: '', customDomainStatus: 'none' })).toBe('kunde.pukalani.app')
  })

  /** Solange das Zertifikat fehlt, bleibt die Subdomain zu Hause — sonst
   *  leitete sie auf ein Zertifikats-Warnschild um. */
  it('eine unfertige Domain gewinnt NICHT', () => {
    for (const status of ['pending_dns', 'pending_cert', 'pending_platform', 'error', '']) {
      expect(canonicalHostFor({ ...base, customDomain: 'www.kunde.de', customDomainStatus: status })).toBe('kunde.pukalani.app')
    }
  })

  it('eine aktive Domain ist die kanonische Adresse', () => {
    expect(canonicalHostFor({ ...base, customDomain: 'www.kunde.de', customDomainStatus: 'active' })).toBe('www.kunde.de')
  })

  it('customDomainIsLive verlangt BEIDES', () => {
    expect(customDomainIsLive('', 'active')).toBe(false)
    expect(customDomainIsLive('www.kunde.de', 'pending_cert')).toBe(false)
    expect(customDomainIsLive('www.kunde.de', 'active')).toBe(true)
  })
})

describe('Eigentums-Nachweis', () => {
  const token = 'a'.repeat(32)

  it('der Record liegt an der BASIS — ein Eintrag für beide Formen', () => {
    expect(customDomainVerifyRecordName('www.kunde.de')).toBe('_pukalani-verify.kunde.de')
    expect(customDomainVerifyRecordName('kunde.de')).toBe('_pukalani-verify.kunde.de')
  })

  it('erkennt das Token in einer Zone mit mehreren Nachweisen', () => {
    const records = [
      ['v=spf1 include:example.com ~all'],
      ['google-site-verification=abc'],
      [customDomainVerifyRecordValue(token)],
    ]
    expect(customDomainTokenPresent(records, token)).toBe(true)
  })

  /** DNS zerlegt lange TXT-Werte in 255-Zeichen-Häppchen. Ein Vergleich, der
   *  nur das erste Stück ansieht, wäre still falsch. */
  it('setzt zerlegte TXT-Werte wieder zusammen', () => {
    const value = customDomainVerifyRecordValue(token)
    expect(customDomainTokenPresent([[value.slice(0, 10), value.slice(10)]], token)).toBe(true)
  })

  it('duldet Anführungszeichen und Leerraum mancher DNS-Oberflächen', () => {
    expect(customDomainTokenPresent([[` "${customDomainVerifyRecordValue(token)}" `]], token)).toBe(true)
  })

  /** DIE GEGENPROBE: ein FREMDES Token gilt nicht. Genau daran hängt, dass
   *  eine andere Community eine Domain nicht übernehmen kann, die zufällig
   *  noch auf unsere IP zeigt. */
  it('ein fremdes Token gilt nicht', () => {
    expect(customDomainTokenPresent([[customDomainVerifyRecordValue('b'.repeat(32))]], token)).toBe(false)
    expect(customDomainTokenPresent([], token)).toBe(false)
    expect(customDomainTokenPresent([[customDomainVerifyRecordValue(token)]], '')).toBe(false)
  })

  it('erkennt gültige Token-Formen', () => {
    expect(isCustomDomainToken(token)).toBe(true)
    expect(isCustomDomainToken('ZZZ')).toBe(false)
    expect(isCustomDomainToken('A'.repeat(32))).toBe(false)
    expect(isCustomDomainToken(null)).toBe(false)
  })
})

describe('domainPointsToUs', () => {
  const ours = { serverIps: ['49.13.211.173'], cnameTarget: 'platform.pukalani.app' }

  it('A-Record auf uns genügt', () => {
    expect(domainPointsToUs({ a: ['49.13.211.173'], cname: '', ...ours })).toBe(true)
  })

  it('CNAME auf uns genügt', () => {
    expect(domainPointsToUs({ a: [], cname: 'platform.pukalani.app.', ...ours })).toBe(true)
  })

  it('fremde Ziele zählen nicht', () => {
    expect(domainPointsToUs({ a: ['1.2.3.4'], cname: 'fremd.example.com', ...ours })).toBe(false)
  })

  /** FAIL-CLOSED: eine vergessene Konfiguration darf nicht „alles zeigt auf
   *  uns" bedeuten — sonst wäre jede Domain sofort aktivierbar. */
  it('ohne Konfiguration zeigt NICHTS auf uns', () => {
    expect(domainPointsToUs({ a: ['1.2.3.4'], cname: 'x.example.com', serverIps: [], cnameTarget: '' })).toBe(false)
    expect(domainPointsToUs({ a: [], cname: '', serverIps: [], cnameTarget: '' })).toBe(false)
  })
})

describe('Plan-Grenze', () => {
  it('eigene Domains gibt es ab Pro', () => {
    expect(customDomainAllowedForPlan('pro')).toBe(true)
    expect(customDomainAllowedForPlan('personal')).toBe(false)
    expect(customDomainAllowedForPlan('basic')).toBe(false)
    expect(customDomainAllowedForPlan(null)).toBe(false)
    // Alt-Wert aus der Zeit vor dem P4-Rename: 'business' → 'pro'.
    expect(customDomainAllowedForPlan('business')).toBe(true)
  })

  /**
   * DER WÄCHTER GEGEN AUSEINANDERLAUFEN.
   *
   * Die Plan-Grenze steht an ZWEI Orten, und das ist unvermeidbar: das
   * Control Plane ist die Autorität (es liest den Plan aus der
   * `communities`-Zeile), `apps/platform` gatet die SICHTBARKEIT über die
   * bestehende Produkt-Mechanik (`pukalani.tenancy.products`) und kann die
   * app.config des Control Plane nicht lesen — anderes Deployment.
   *
   * Liefe eines der beiden weg, entstünde genau die Sorte Fehler, die niemand
   * bemerkt: die Seite verschwindet für einen Kunden, der sie bezahlt hat,
   * oder sie steht einem offen, der sie nicht bezahlt hat und dann an einem
   * 403 landet. Deshalb liest dieser Test die andere Datei.
   */
  it('apps/platform nennt dieselbe Grenze wie das Control Plane', () => {
    const source = readFileSync(join(import.meta.dirname, '../../../apps/platform/app/app.config.ts'), 'utf8')
    const match = source.match(/customDomain:\s*'([a-z]+)'/)
    expect(match?.[1]).toBe(CUSTOM_DOMAIN_MIN_PLAN)
  })
})

describe('isDryRunFlag', () => {
  /**
   * 2026-08-07 LIVE ERWISCHT: `runtimeConfig` typisiert den Schalter als
   * String (Default ''), Nuxt schiebt eine Env-Überschreibung aber durch
   * `destr()` — aus `NUXT_CUSTOM_DOMAIN_DRY_RUN=1` wird die ZAHL 1, und
   * `1 === '1'` ist falsch. Der volle Rundlauf lief deshalb gegen echtes ploi
   * statt im Trockenlauf und meldete „ploi ist nicht konfiguriert"; das sah
   * aus wie ein fehlendes Token und war ein Typ.
   */
  it('nimmt die Zahl 1 genauso wie den String', () => {
    expect(isDryRunFlag(1)).toBe(true)
    expect(isDryRunFlag('1')).toBe(true)
  })

  it('nimmt, was ein Mensch schreiben würde', () => {
    for (const value of ['true', 'TRUE', 'yes', 'on', true]) {
      expect(isDryRunFlag(value)).toBe(true)
    }
  })

  it('alles andere heißt aus', () => {
    for (const value of ['', '0', 'false', 'no', undefined, null, 0]) {
      expect(isDryRunFlag(value)).toBe(false)
    }
  })
})
