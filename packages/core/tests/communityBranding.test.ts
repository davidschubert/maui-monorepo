import { describe, expect, it } from 'vitest'
import {
  COMMUNITY_BRANDING_TABLE,
  mirrorBelongsToCommunity,
  mirrorRowToBranding,
} from '../shared/communityBranding'

/**
 * Der SPIEGEL der Community-Farbwahl (D6, 2026-08-01) — die zwei puren Regeln,
 * an denen die Live-Propagation hängt.
 *
 * Zu beweisen sind genau zwei Dinge:
 *  1. Eine Spiegel-Row wird zum SELBEN Tripel, das der SSR-Spiegel liefert —
 *     inklusive der '' für fehlende Spalten (Appwrite backfillt nicht).
 *  2. Der Netz-Filter ist fail-closed in BEIDE Richtungen: fremde Row raus,
 *     und ohne bekannte Community-Id gilt gar nichts.
 *
 * Dass ein gespiegelter Wert danach durch dieselbe Vorrangregel läuft wie der
 * SSR-Wert (B5: Mandanten-Host ⇒ Community, sonst Besucher), steht bewusst
 * NICHT hier, sondern in packages/themes/tests/themeSelection.test.ts —
 * core ist Fundament und importiert nie aus einem Produkt-Layer.
 */
describe('mirrorRowToBranding — Spiegel-Row → Wahl der Community', () => {
  it('nimmt alle drei Felder', () => {
    expect(mirrorRowToBranding({ $id: 'c1', theme: 'crimson', variant: 'deep', neutral: 'slate' }))
      .toEqual({ theme: 'crimson', variant: 'deep', neutral: 'slate' })
  })

  it('fehlende/leere Spalten werden zu \'\' — „keine eigene Wahl", wie im SSR-Spiegel', () => {
    expect(mirrorRowToBranding({ $id: 'c1' })).toEqual({ theme: '', variant: '', neutral: '' })
    expect(mirrorRowToBranding({ $id: 'c1', theme: 'crimson', variant: null, neutral: null }))
      .toEqual({ theme: 'crimson', variant: '', neutral: '' })
  })
})

describe('mirrorBelongsToCommunity — das Netz neben der Row-Subscription', () => {
  it('eigene Row → ja', () => {
    expect(mirrorBelongsToCommunity({ $id: 'c1' }, 'c1')).toBe(true)
  })

  it('fremde Row → nein (ein Fenster auf kunde-b bleibt unberührt)', () => {
    expect(mirrorBelongsToCommunity({ $id: 'c2' }, 'c1')).toBe(false)
  })

  it('ohne Community-Id → nein (Kontroll-Host, Silo, Playground)', () => {
    expect(mirrorBelongsToCommunity({ $id: 'c1' }, null)).toBe(false)
  })
})

describe('Tabellenname', () => {
  it('ist der Vertrag zwischen Migration (system-028), Schreiber und Leser', () => {
    expect(COMMUNITY_BRANDING_TABLE).toBe('community_branding')
  })
})
