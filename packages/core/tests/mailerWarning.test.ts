import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * F44: „Mailer aus" und „Mailer vergessen" sehen identisch aus.
 *
 * Genau dieser Unterschied war in Produktion unsichtbar — apps/platform lief
 * ohne SMTP, und für JEDE Kunden-Community ging nie eine Benachrichtigung raus.
 *
 * Zwei Dinge sind hier festgenagelt, und beide sind der eigentliche Entwurf:
 * die Warnung fällt genau einmal (eine je Mail wäre Lärm, den man wegfiltert,
 * und damit wieder still), und `isMailerConfigured()` bleibt STUMM. Diese Frage
 * stellt auch der Digest-Sweep beim Start jeder App; help, marketing und
 * portfolio verschicken bewusst nichts und dürfen nicht gewarnt werden.
 */
const config = { smtpHost: '', smtpPort: '587', smtpUser: '', smtpPass: '', smtpFrom: '' }
vi.stubGlobal('useRuntimeConfig', () => config)

const { __resetMailerWarnings, isMailerConfigured, sendMail, warnMailerMissingOnce } = await import('../server/utils/mailer')

describe('Mailer-Warnung', () => {
  beforeEach(() => {
    __resetMailerWarnings()
    config.smtpHost = ''
  })

  it('fällt genau EINMAL, egal wie viele Mails verworfen werden', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await sendMail(undefined, { to: 'a@example.test', subject: 's', text: 't' })).toBe(false)
    expect(await sendMail(undefined, { to: 'b@example.test', subject: 's', text: 't' })).toBe(false)
    warnMailerMissingOnce('noch etwas')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('NUXT_SMTP_HOST')
    warn.mockRestore()
  })

  it('nennt die Empfängeradresse nur angedeutet', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await sendMail(undefined, { to: 'moderator@example.test', subject: 's', text: 't' })
    const line = String(warn.mock.calls[0]?.[0])
    expect(line).toContain('m***@example.test')
    expect(line).not.toContain('moderator@')
    warn.mockRestore()
  })

  it('isMailerConfigured() warnt NICHT — sonst meldet sich jede mail-lose App beim Start', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isMailerConfigured()).toBe(false)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('schweigt vollständig, wenn ein Host gesetzt ist', () => {
    config.smtpHost = 'smtp.example.test'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isMailerConfigured()).toBe(true)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
