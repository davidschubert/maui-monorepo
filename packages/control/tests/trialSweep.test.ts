import { describe, expect, it } from 'vitest'
import { shouldEndTrial } from '../server/utils/trialSweep'
import { trialEndsAt } from '../shared/onboarding'

const NOW = Date.parse('2026-08-10T12:00:00.000Z')
const EXPIRED = '2026-08-01T00:00:00.000Z'
const RUNNING = trialEndsAt(NOW) // 14 Tage in der Zukunft

const base = { plan: 'pro' as const, trialEndsAt: EXPIRED, status: 'active' as const }

describe('Testphase beenden', () => {
  it('stuft eine abgelaufene, unbezahlte Testphase herab', () => {
    expect(shouldEndTrial(base, NOW)).toBe(true)
  })

  it('lässt eine laufende Testphase in Ruhe', () => {
    expect(shouldEndTrial({ ...base, trialEndsAt: RUNNING }, NOW)).toBe(false)
  })

  it('fasst BEZAHLTE Kunden nicht an — auch bei altem Trial-Datum', () => {
    // Das ist der teure Fehler, den dieser Test verhindert: wer inzwischen Pro
    // gekauft hat, darf nicht herabgestuft werden, nur weil sein
    // Testphasen-Datum in der Vergangenheit liegt. Seit A6 Schritt 5 steht die
    // Antwort in derselben Row (billingStatus), nicht mehr im Workspace.
    expect(shouldEndTrial({ ...base, billingStatus: 'active' }, NOW)).toBe(false)
  })

  it('ignoriert Tenants, die gar nicht im Trial-Plan sind', () => {
    expect(shouldEndTrial({ ...base, plan: 'basic' }, NOW)).toBe(false)
    expect(shouldEndTrial({ ...base, plan: 'personal' }, NOW)).toBe(false)
  })

  it('ignoriert deaktivierte Sites', () => {
    expect(shouldEndTrial({ ...base, status: 'disabled' }, NOW)).toBe(false)
  })

  it('A6: ein lebendes COMMUNITY-Abo ist ein Veto — auch past_due (Dunning = Grace)', () => {
    expect(shouldEndTrial({ ...base, billingStatus: 'active' }, NOW)).toBe(false)
    expect(shouldEndTrial({ ...base, billingStatus: 'past_due' }, NOW)).toBe(false)
    // gekündigt oder nie ein Abo → Testphase endet normal
    expect(shouldEndTrial({ ...base, billingStatus: 'canceled' }, NOW)).toBe(true)
    expect(shouldEndTrial({ ...base, billingStatus: '' }, NOW)).toBe(true)
  })

  it('verträgt fehlende und kaputte Datumswerte, ohne herabzustufen', () => {
    for (const value of [null, '', 'bald', '2026-13-45'] as unknown as string[]) {
      expect(shouldEndTrial({ ...base, trialEndsAt: value }, NOW), String(value)).toBe(false)
    }
  })
})
