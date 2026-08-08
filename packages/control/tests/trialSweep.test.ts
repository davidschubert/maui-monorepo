import { describe, expect, it } from 'vitest'
import { shouldEndTrial } from '../server/utils/trialSweep'
import { trialEndsAt } from '../shared/onboarding'

/**
 * Ende der Testphase = NUR-LESEND (F49, Davids Entscheidung vom 2026-08-07).
 *
 * Die Zeit wird INJIZIERT (`now`), nicht gemessen — sonst wäre der Test nur an
 * bestimmten Kalendertagen grün und bewiese nichts.
 */
const NOW = Date.parse('2026-08-10T12:00:00.000Z')
const EXPIRED = '2026-08-01T00:00:00.000Z'
const RUNNING = trialEndsAt(NOW) // 14 Tage in der Zukunft

const base = { trialEndsAt: EXPIRED, status: 'active' as const }

describe('Testphase beenden', () => {
  it('sperrt eine abgelaufene, unbezahlte Testphase', () => {
    expect(shouldEndTrial(base, NOW)).toBe(true)
  })

  it('lässt eine laufende Testphase in Ruhe', () => {
    expect(shouldEndTrial({ ...base, trialEndsAt: RUNNING }, NOW)).toBe(false)
  })

  it('fasst BEZAHLTE Kunden nicht an — auch bei altem Trial-Datum', () => {
    // Das ist der teure Fehler, den dieser Test verhindert: wer inzwischen Pro
    // gekauft hat, darf nicht gesperrt werden, nur weil sein Testphasen-Datum
    // in der Vergangenheit liegt. Seit A6 Schritt 5 steht die Antwort in
    // derselben Row (billingStatus), nicht mehr im Workspace.
    expect(shouldEndTrial({ ...base, billingStatus: 'active' }, NOW)).toBe(false)
  })

  it('F49 RÜCKWIRKEND: der Bestand auf plan „basic" wird mitgenommen', () => {
    // Bis F49 stieg die Regel bei `plan !== 'pro'` aus. Genau dieser Ausstieg
    // hätte den Bestand für immer durchrutschen lassen: eine Community, deren
    // Trial VOR dem 2026-08-07 ablief, steht längst auf 'basic'. Der Plan ist
    // deshalb gar kein Eingabefeld mehr — geschützt wird über das Abo-Veto.
    // Die Zwischenvariable ist Absicht: als Objekt-LITERAL an der Aufrufstelle
    // wäre `plan` eine überzählige Eigenschaft und TypeScript würde meckern —
    // genau das ist der Beweis, dass der Plan die Regel nicht mehr erreicht.
    const bestand = { ...base, plan: 'basic' as const }
    expect(shouldEndTrial(bestand, NOW)).toBe(true)
  })

  it('ignoriert deaktivierte Sites', () => {
    expect(shouldEndTrial({ ...base, status: 'disabled' }, NOW)).toBe(false)
  })

  it('A6: ein lebendes COMMUNITY-Abo ist ein Veto — auch past_due (Dunning = Grace)', () => {
    expect(shouldEndTrial({ ...base, billingStatus: 'active' }, NOW)).toBe(false)
    // past_due gehört dem pastDueSweep: der sperrt nach 14 Tagen Frist und mit
    // dem richtigen Grund. Zwei Läufe auf derselben Row wären zwei Wahrheiten.
    expect(shouldEndTrial({ ...base, billingStatus: 'past_due' }, NOW)).toBe(false)
    // gekündigt oder nie ein Abo → Testphase endet, Community wird nur-lesend
    expect(shouldEndTrial({ ...base, billingStatus: 'canceled' }, NOW)).toBe(true)
    expect(shouldEndTrial({ ...base, billingStatus: '' }, NOW)).toBe(true)
    expect(shouldEndTrial({ ...base, billingStatus: null }, NOW)).toBe(true)
  })

  it('rührt eine bestehende Sperre NIE an', () => {
    // 'abuse' ist die schärfere Sperre (Host offline) — sie darf nicht
    // stillschweigend auf „nur-lesend" heruntergestuft werden.
    expect(shouldEndTrial({ ...base, suspension: 'abuse' }, NOW)).toBe(false)
    // 'billing' ist bereits erledigt: das ist die Idempotenz des stündlichen
    // Laufs — ohne sie schriebe er jede Stunde ein neues `suspendedAt`.
    expect(shouldEndTrial({ ...base, suspension: 'billing' }, NOW)).toBe(false)
    // null = Row von vor control-034 (Appwrite backfillt Defaults nicht)
    expect(shouldEndTrial({ ...base, suspension: null }, NOW)).toBe(true)
    expect(shouldEndTrial({ ...base, suspension: '' }, NOW)).toBe(true)
  })

  it('verträgt fehlende und kaputte Datumswerte, ohne zu sperren', () => {
    for (const value of [null, '', 'bald', '2026-13-45'] as unknown as string[]) {
      expect(shouldEndTrial({ ...base, trialEndsAt: value }, NOW), String(value)).toBe(false)
    }
  })
})
