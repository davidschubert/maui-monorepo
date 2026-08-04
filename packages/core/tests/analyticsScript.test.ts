import { describe, expect, it } from 'vitest'
import { ANALYTICS_SCRIPT_ID_RE, isPlausibleScriptId, plausibleScriptUrl } from '../shared/analyticsScript'

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
