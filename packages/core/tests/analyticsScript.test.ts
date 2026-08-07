import { describe, expect, it } from 'vitest'
import { ANALYTICS_EVENT_NAMES, ANALYTICS_EVENTS, analyticsEventKey } from '../shared/analyticsEvents'
import { ANALYTICS_PROXY_EVENT_PATH, ANALYTICS_SCRIPT_ID_RE, effectiveScriptId, isPlausibleScriptId, plausibleProxyScriptPath, plausibleScriptUrl } from '../shared/analyticsScript'

describe('isPlausibleScriptId', () => {
  it('erkennt echte v3-Ids und den Leerstring (= aus)', () => {
    expect(isPlausibleScriptId('pa-NFzv_HzyhC-TnVE577Kx6')).toBe(true)
    expect(isPlausibleScriptId('')).toBe(true)
  })

  it('weist alles ab, was eine HERKUNFT benennen könnte', () => {
    for (const value of [
      'https://boese.example/js/x.js',
      '//boese.example/x.js',
      'pa-abcdefgh.js',
      'pa-abcdefgh/../evil',
      'pa-abcdefgh?x=1',
      'pa-abcdefgh:8080',
    ]) {
      expect(isPlausibleScriptId(value)).toBe(false)
    }
  })

  it('ist ein Typ-Wächter — Nicht-Strings fallen durch', () => {
    expect(isPlausibleScriptId(undefined)).toBe(false)
    expect(isPlausibleScriptId(null)).toBe(false)
    expect(isPlausibleScriptId(42)).toBe(false)
  })

  it('das Muster ist verankert (kein Treffer irgendwo in der Mitte)', () => {
    expect(ANALYTICS_SCRIPT_ID_RE.test('x pa-abcdefgh')).toBe(false)
    expect(ANALYTICS_SCRIPT_ID_RE.test('pa-abcdefgh x')).toBe(false)
  })
})

describe('plausibleScriptUrl', () => {
  it('baut die Adresse aus Instanz + Id', () => {
    expect(plausibleScriptUrl('https://plausible.hawaii.studio', 'pa-abcdefgh'))
      .toBe('https://plausible.hawaii.studio/js/pa-abcdefgh.js')
  })

  it('normalisiert Schrägstriche am Ende der Instanz', () => {
    expect(plausibleScriptUrl('https://plausible.hawaii.studio//', 'pa-abcdefgh'))
      .toBe('https://plausible.hawaii.studio/js/pa-abcdefgh.js')
  })

  /**
   * Die Gegenprobe, ohne die der Rest wertlos wäre: eine ungeprüfte Id würde
   * hier zu einer Adresse mit fremder Herkunft — genau das darf nicht gehen.
   */
  it('gibt LEER zurück statt eine fremde Adresse zu bauen', () => {
    expect(plausibleScriptUrl('https://plausible.hawaii.studio', 'https://boese.example/x.js')).toBe('')
    expect(plausibleScriptUrl('https://plausible.hawaii.studio', '../../boese')).toBe('')
  })

  it('gibt LEER zurück, wenn eine Seite fehlt', () => {
    expect(plausibleScriptUrl('', 'pa-abcdefgh')).toBe('')
    expect(plausibleScriptUrl('https://plausible.hawaii.studio', '')).toBe('')
    expect(plausibleScriptUrl(undefined, undefined)).toBe('')
  })
})

describe('effectiveScriptId', () => {
  const OWN = 'pa-NFzv_HzyhC-TnVE577Kx6'
  const SHARED = { scriptId: 'pa-nw6c94JiRWqzOc-zDcn1a' }

  it('die eigene Site gewinnt — auch gegen einen eingeschalteten Schalter', () => {
    expect(effectiveScriptId({ plausibleScriptId: OWN }, SHARED)).toBe(OWN)
    expect(effectiveScriptId({ plausibleScriptId: OWN, enabled: true }, SHARED)).toBe(OWN)
    expect(effectiveScriptId({ plausibleScriptId: OWN, enabled: false }, SHARED)).toBe(OWN)
  })

  it('sonst zählt der Schalter — mit der Id der Sammel-Site', () => {
    expect(effectiveScriptId({ plausibleScriptId: '', enabled: true }, SHARED)).toBe(SHARED.scriptId)
    expect(effectiveScriptId({ enabled: true }, SHARED)).toBe(SHARED.scriptId)
  })

  it('aus heißt aus — kein Rückfall auf irgendeine Vorgabe', () => {
    expect(effectiveScriptId({ plausibleScriptId: '', enabled: false }, SHARED)).toBe('')
    expect(effectiveScriptId({}, SHARED)).toBe('')
    expect(effectiveScriptId(null, SHARED)).toBe('')
    expect(effectiveScriptId(undefined, SHARED)).toBe('')
  })

  it('ohne Sammel-Site ist der Schalter wirkungslos (Silo, lokale Entwicklung)', () => {
    expect(effectiveScriptId({ enabled: true }, {})).toBe('')
    expect(effectiveScriptId({ enabled: true }, { scriptId: '' })).toBe('')
  })

  /**
   * Die Prüfung gilt BEIDEN Herkünften: auch ein Wert aus der App-Config wird
   * zu einem `<script src>`, und ein Tippfehler dort ist kein Freibrief.
   */
  it('lässt keine unbrauchbare Id durch — weder aus der Zeile noch aus der Config', () => {
    expect(effectiveScriptId({ plausibleScriptId: 'https://boese.example/x.js' }, SHARED)).toBe('')
    expect(effectiveScriptId({ plausibleScriptId: 'https://boese.example/x.js', enabled: true }, SHARED)).toBe(SHARED.scriptId)
    expect(effectiveScriptId({ enabled: true }, { scriptId: 'https://boese.example/x.js' })).toBe('')
  })
})

describe('plausibleProxyScriptPath (Adblock-Proxy, F47)', () => {
  it('baut den relativen Pfad hinter dem eigenen Host', () => {
    expect(plausibleProxyScriptPath('pa-abcdefgh')).toBe('/js/pa-abcdefgh.js')
  })

  /**
   * Dieselbe Gegenprobe wie bei der absoluten Adresse: eine ungeprüfte Id
   * stünde als Pfad im eigenen Namensraum — auch dort darf sie nichts benennen.
   */
  it('gibt LEER zurück für alles außerhalb der Id-Form', () => {
    expect(plausibleProxyScriptPath('')).toBe('')
    expect(plausibleProxyScriptPath(undefined)).toBe('')
    expect(plausibleProxyScriptPath('pa-abcdefgh/../evil')).toBe('')
    expect(plausibleProxyScriptPath('https://boese.example/x.js')).toBe('')
  })

  it('der Event-Endpunkt ist ein fester relativer Pfad', () => {
    expect(ANALYTICS_PROXY_EVENT_PATH).toBe('/api/event')
  })
})

describe('das Ereignis-Vokabular (F47)', () => {
  it('Namen sind eindeutig und kollidieren nicht mit den eingebauten Events', () => {
    expect(new Set(ANALYTICS_EVENT_NAMES).size).toBe(ANALYTICS_EVENT_NAMES.length)
    // Plausible v3 sendet `pageview` und `engagement` von selbst — stünde
    // einer dieser Namen im Vokabular, zählte die Dashboard-Liste Seitenaufrufe
    // als „Aktion".
    expect(ANALYTICS_EVENT_NAMES).not.toContain('pageview')
    expect(ANALYTICS_EVENT_NAMES).not.toContain('engagement')
  })

  it('jeder Name findet zurück zu seinem Schlüssel (Anzeige-Übersetzung)', () => {
    for (const [key, name] of Object.entries(ANALYTICS_EVENTS)) {
      expect(analyticsEventKey(name)).toBe(key)
    }
    expect(analyticsEventKey('pageview')).toBeUndefined()
  })
})
