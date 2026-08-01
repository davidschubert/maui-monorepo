import { describe, expect, it } from 'vitest'
import {
  UNKNOWN_HOST_CODE,
  UNKNOWN_HOST_STATUS_TEXT,
  isErrorPageRenderPass,
  isUnknownHostError,
} from '../shared/unknownHost'

/**
 * C12b — die zwei Regeln, die den „500 - Unknown host" beendet haben:
 * 1. WELCHER Request darf die Mandanten-Auflösung überspringen (sonst wirft die
 *    Middleware auch beim Rendern der Fehlerseite und Nuxt fällt auf sein
 *    eingebautes Template zurück).
 * 2. WELCHER Fehler bekommt den Besucher-Satz „gehört zu keiner Community".
 */
describe('Fehlerseiten-Renderpass erkennen', () => {
  it('erkennt Nuxts internen Renderpass — mit und ohne Query', () => {
    expect(isErrorPageRenderPass('/__nuxt_error')).toBe(true)
    expect(isErrorPageRenderPass('/__nuxt_error?statusCode=404&statusMessage=Unknown+host')).toBe(true)
  })

  it('lässt gewöhnliche Pfade NICHT durch (sie müssen weiter 404 bekommen)', () => {
    for (const path of ['/', '/api/comments', '/dashboard', '/nuxt_error', '/x/__nuxt_error', '', undefined, null]) {
      expect(isErrorPageRenderPass(path)).toBe(false)
    }
  })
})

describe('Unbekannten Host im Fehler erkennen', () => {
  it('erkennt den geworfenen Fehler am fachlichen Code (Server-Seite)', () => {
    expect(isUnknownHostError({
      statusCode: 404,
      statusMessage: UNKNOWN_HOST_STATUS_TEXT,
      data: { code: UNKNOWN_HOST_CODE },
    })).toBe(true)
  })

  it('erkennt ihn auch, wenn nur der Statustext die Query überlebt hat (Client-Seite)', () => {
    // So kommt er im Browser an: Nuxt serialisiert den Fehler in die
    // /__nuxt_error-Query; `data` überlebt das nicht zuverlässig.
    expect(isUnknownHostError({ statusCode: 404, statusMessage: UNKNOWN_HOST_STATUS_TEXT })).toBe(true)
    expect(isUnknownHostError({ status: '404', statusText: UNKNOWN_HOST_STATUS_TEXT })).toBe(true)
    expect(isUnknownHostError({ statusCode: 404, data: '{"code":"unknown_host"}' })).toBe(true)
  })

  it('lässt gewöhnliche 404 in Ruhe — die bleiben „Diese Seite existiert nicht"', () => {
    expect(isUnknownHostError({ statusCode: 404, statusMessage: 'Not Found' })).toBe(false)
    expect(isUnknownHostError({ statusCode: 404 })).toBe(false)
  })

  it('beschönigt KEINEN 5xx (ein kaputter Resolver wirft bewusst fail-loud)', () => {
    expect(isUnknownHostError({ statusCode: 500, statusMessage: UNKNOWN_HOST_STATUS_TEXT })).toBe(false)
    expect(isUnknownHostError({ statusCode: 500, data: { code: UNKNOWN_HOST_CODE } })).toBe(false)
  })

  it('verträgt fehlende, leere und kaputte Eingaben', () => {
    expect(isUnknownHostError(null)).toBe(false)
    expect(isUnknownHostError(undefined)).toBe(false)
    expect(isUnknownHostError({})).toBe(false)
    expect(isUnknownHostError({ statusCode: 404, data: 'kein json' })).toBe(false)
    expect(isUnknownHostError({ statusCode: 404, data: { code: 42 } })).toBe(false)
  })
})
