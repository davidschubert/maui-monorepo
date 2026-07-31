import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetMisconfigurationWarnings, warnMisconfiguredOnce } from '../server/utils/stripe'

/**
 * Die Meldungen über fehlende Stripe-Secrets hängen an ÖFFENTLICHEN,
 * unauthentifizierten Routen (`/api/billing/prices`, `/api/stripe/webhook`).
 * Ohne Bremse schreibt jeder Fremde im Netz beliebig viele Zeilen ins Log —
 * mit exakt null zusätzlicher Information, weil sich eine fehlende
 * Konfiguration innerhalb eines Prozesses nicht ändert.
 */
describe('warnMisconfiguredOnce', () => {
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    __resetMisconfigurationWarnings()
    spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    spy.mockRestore()
    __resetMisconfigurationWarnings()
  })

  it('meldet beim ersten Mal', () => {
    warnMisconfiguredOnce('secretKey', 'fehlt')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('fehlt')
  })

  it('schweigt bei jeder Wiederholung — auch bei 100 Anfragen', () => {
    for (let i = 0; i < 100; i++) warnMisconfiguredOnce('secretKey', 'fehlt')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('trennt die beiden Secrets — ein fehlender Key verdeckt nicht das fehlende Webhook-Secret', () => {
    warnMisconfiguredOnce('secretKey', 'A')
    warnMisconfiguredOnce('webhookSecret', 'B')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('meldet nach einem Neustart wieder — eine echte Fehlkonfiguration bleibt nach jedem Deploy sichtbar', () => {
    warnMisconfiguredOnce('secretKey', 'fehlt')
    __resetMisconfigurationWarnings() // = frischer Prozess
    warnMisconfiguredOnce('secretKey', 'fehlt')
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
