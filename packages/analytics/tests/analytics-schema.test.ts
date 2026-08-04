import { describe, expect, it } from 'vitest'
import { createAnalyticsSettingsSchema } from '../schemas/analytics'
import { plausibleScriptUrl } from '../../core/shared/analyticsScript'

const schema = createAnalyticsSettingsSchema()
const parse = (plausibleScriptId: string) => schema.safeParse({ plausibleScriptId })

describe('createAnalyticsSettingsSchema', () => {
  it('nimmt eine echte Plausible-v3-Id an', () => {
    expect(parse('pa-NFzv_HzyhC-TnVE577Kx6').success).toBe(true)
    expect(parse('pa-lXh3V4rHPB9Z2yPCDk6eK').success).toBe(true)
  })

  it('nimmt den Leerstring an — das ist das Abschalten', () => {
    expect(parse('').success).toBe(true)
  })

  it('trimmt Zwischenablage-Rand (Leerzeichen beim Kopieren)', () => {
    const result = parse('  pa-NFzv_HzyhC-TnVE577Kx6  ')
    expect(result.success).toBe(true)
    expect(result.success && result.data.plausibleScriptId).toBe('pa-NFzv_HzyhC-TnVE577Kx6')
  })

  it('lehnt alles ohne pa--Präfix ab', () => {
    expect(parse('NFzv_HzyhC-TnVE577Kx6').success).toBe(false)
    expect(parse('pb-NFzv_HzyhC-TnVE577Kx6').success).toBe(false)
    expect(parse('PA-NFzv_HzyhC-TnVE577Kx6').success).toBe(false)
  })

  /**
   * Der eigentliche Zweck der Prüfung: nichts, was eine fremde HERKUNFT
   * benennen kann, darf durch — der Wert wird zu einem `<script src>`.
   */
  it('lehnt alles ab, was eine Adresse sein könnte', () => {
    expect(parse('https://boese.example/js/x.js').success).toBe(false)
    expect(parse('pa-abcdefgh/../../evil').success).toBe(false)
    expect(parse('pa-abcdefgh.js').success).toBe(false)
    expect(parse('pa-abcdefgh?x=1').success).toBe(false)
    expect(parse('pa-abcdefgh"></script><script>').success).toBe(false)
  })

  it('lehnt zu kurze und zu lange Ids ab', () => {
    expect(parse('pa-abc').success).toBe(false)
    expect(parse(`pa-${'a'.repeat(81)}`).success).toBe(false)
    expect(parse(`pa-${'a'.repeat(80)}`).success).toBe(true)
  })

  it('verwirft unbekannte Felder (strict)', () => {
    expect(schema.safeParse({ plausibleScriptId: '', src: 'https://boese.example/x.js' }).success).toBe(false)
  })
})

describe('plausibleScriptUrl', () => {
  it('setzt Instanz + Id zur Script-Adresse zusammen', () => {
    expect(plausibleScriptUrl('https://plausible.hawaii.studio', 'pa-abcdefgh'))
      .toBe('https://plausible.hawaii.studio/js/pa-abcdefgh.js')
  })

  it('duldet einen Schrägstrich am Ende der Instanz', () => {
    expect(plausibleScriptUrl('https://plausible.hawaii.studio/', 'pa-abcdefgh'))
      .toBe('https://plausible.hawaii.studio/js/pa-abcdefgh.js')
  })

  it('gibt LEER zurück, wenn etwas fehlt oder nicht der Form entspricht', () => {
    expect(plausibleScriptUrl('https://plausible.hawaii.studio', '')).toBe('')
    expect(plausibleScriptUrl('', 'pa-abcdefgh')).toBe('')
    expect(plausibleScriptUrl('https://plausible.hawaii.studio', 'https://boese.example/x.js')).toBe('')
  })
})
