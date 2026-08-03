import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * F44: „Mailer aus" und „Mailer vergessen" sehen identisch aus.
 *
 * Genau dieser Unterschied war in Produktion unsichtbar — apps/platform lief
 * ohne SMTP, und für JEDE Kunden-Community ging nie eine Benachrichtigung raus.
 * Der Test nagelt fest, dass der Server es sagt, und zwar genau einmal: eine
 * Warnung je Request wäre Lärm, den man wegfiltert, und damit wieder still.
 */
const config = { smtpHost: '' }
vi.stubGlobal('useRuntimeConfig', () => config)

const { __resetMailerWarnings, isMailerConfigured } = await import('../server/utils/mailer')

describe('isMailerConfigured', () => {
  beforeEach(() => {
    __resetMailerWarnings()
    config.smtpHost = ''
  })

  it('warnt genau EINMAL, wenn kein SMTP-Host gesetzt ist', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isMailerConfigured()).toBe(false)
    expect(isMailerConfigured()).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('NUXT_SMTP_HOST')
    warn.mockRestore()
  })

  it('schweigt, wenn ein Host gesetzt ist', () => {
    config.smtpHost = 'smtp.example.test'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isMailerConfigured()).toBe(true)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
