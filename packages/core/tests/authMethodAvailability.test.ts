import { describe, it, expect } from 'vitest'
import { AUTH_METHOD_UNAVAILABLE_CODE, instanceAuthFeatureGap } from '../shared/authMethodAvailability'
import { domainReasonFrom } from '../shared/types/error'
import de from '../i18n/locales/de.json'
import en from '../i18n/locales/en.json'

/**
 * F37 — DER PASSWORTLOSE LOGIN DARF KEINE SACKGASSE SEIN.
 *
 * `pukalani.auth.otp` ist ein Schalter in der APP. Ob die Instanz ihn erfüllen
 * kann, entscheidet die Appwrite-Console („Auth → Settings → Email OTP") und
 * das SMTP der Instanz. Passt das nicht zusammen, lief der Nutzer bis heute in
 * ein generisches „Code konnte nicht angefordert werden" — ein Text, der zum
 * Wiederholen einlädt, obwohl Wiederholen nie hilft.
 */
describe('instanceAuthFeatureGap', () => {
  it('erkennt die abgeschaltete Anmeldeart (501 user_auth_method_unsupported)', () => {
    expect(instanceAuthFeatureGap({ type: 'user_auth_method_unsupported', code: 501 }))
      .toBe('method_disabled')
  })

  it('erkennt die Instanz ohne Mailversand (503 general_smtp_disabled)', () => {
    expect(instanceAuthFeatureGap({ type: 'general_smtp_disabled', code: 503 }))
      .toBe('smtp_disabled')
  })

  it('greift NICHT nach dem Status: ein anderer 501 ist eine andere Auskunft', () => {
    // „Nutzerlimit erreicht" ist ebenfalls 501 — daraus „OTP ist hier
    // abgeschaltet" zu machen, wäre eine Lüge mit falscher Handlungsanweisung.
    expect(instanceAuthFeatureGap({ type: 'user_count_exceeded', code: 501 })).toBe(null)
  })

  it('lässt gewöhnliche Fehlschläge unangetastet', () => {
    expect(instanceAuthFeatureGap({ type: 'general_rate_limit_exceeded', code: 429 })).toBe(null)
    expect(instanceAuthFeatureGap({ type: 'general_argument_invalid', code: 400 })).toBe(null)
    expect(instanceAuthFeatureGap(new Error('socket hang up'))).toBe(null)
    expect(instanceAuthFeatureGap(null)).toBe(null)
    expect(instanceAuthFeatureGap(undefined)).toBe(null)
    expect(instanceAuthFeatureGap('kaputt')).toBe(null)
  })

  it('der Grund kommt beim Client wirklich an (Envelope-Kette)', () => {
    // core/server/error.ts hebt NUR einen kurzen, selbst geschriebenen
    // Schlüssel aus `error.data.code` als `reason` ins Envelope. Ein Schlüssel
    // mit Punkt oder Großbuchstabe würde still verschluckt — und die
    // Anmeldeseite fiele auf den generischen Text zurück, ohne dass es
    // jemandem auffällt (genau der Fehler, der den `last_admin`-Zweig der
    // Nutzerverwaltung bis 2026-07-29 zu totem Code machte).
    expect(AUTH_METHOD_UNAVAILABLE_CODE).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
    expect(domainReasonFrom({ code: AUTH_METHOD_UNAVAILABLE_CODE })).toBe(AUTH_METHOD_UNAVAILABLE_CODE)
  })

  it('und die Anmeldeseite hat einen eigenen Satz dafür', () => {
    // Ohne diesen Schlüssel liefe der Fall in `auth.otp.requestFailed`
    // („bitte erneut versuchen") — ein Text, der zum Wiederholen einlädt,
    // obwohl Wiederholen hier nie hilft.
    for (const [locale, messages] of Object.entries({ de, en })) {
      expect(messages.auth?.otp?.unavailable, locale).toBeTruthy()
      expect(messages.auth.otp.unavailable, locale).not.toBe(messages.auth.otp.requestFailed)
    }
  })
})
