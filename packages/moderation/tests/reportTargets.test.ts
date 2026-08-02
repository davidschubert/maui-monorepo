import { beforeEach, describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { ALREADY_REPORTED_CODE, REPORT_ERROR_CODES, reportErrorReason } from '../shared/reportErrors'

/**
 * Moderations-Audit Befunde 3 + 8 (2026-08-01).
 *
 * Befund 8 — WOGEGEN darf gemeldet werden? Vorher: gegen alles. targetType und
 * targetId waren freie Strings, jede erfundene Kombination wurde eine Zeile.
 * Jetzt muss ein Layer seinen Ziel-Typ anmelden UND das Ziel muss existieren.
 *
 * Befund 3 — EINE WAHRHEIT für „schon gemeldet". Die Route wirft 409 mit
 * `data.code`, der zentrale Handler hebt ihn als `reason` ins Envelope, der
 * Client liest ihn hier. Vorher antwortete sie 200 `{alreadyReported:true}`,
 * während die Konsumenten auf 409 verzweigten — der Zweig war tot, der Nutzer
 * bekam „Meldung eingegangen" für etwas, das nicht angelegt wurde.
 */

// Nitro stellt createError global bereit (Auto-Import). Für den Test bauen wir
// denselben Fehler nach: Status + `data`, so wie createError ihn formt.
interface FakeError extends Error { status?: number, data?: { code?: string } }
;(globalThis as { createError?: (input: { status?: number, statusText?: string, data?: { code?: string } }) => Error }).createError
  ??= (input) => {
    const error = new Error(input.statusText ?? 'Error') as FakeError
    error.status = input.status
    error.data = input.data
    return error
  }

const { __resetReportTargets, assertReportTarget, registerReportTarget, registeredReportTargets }
  = await import('../server/utils/reportTargets')

const event = {} as H3Event
const statusOf = (error: unknown) => (error as FakeError).status
const codeOf = (error: unknown) => (error as FakeError).data?.code

beforeEach(() => __resetReportTargets())

describe('meldbare Ziel-Typen müssen angemeldet sein', () => {
  it('unbekannter Typ → 400 unknown_target (kein stiller Datensatz mehr)', async () => {
    await expect(assertReportTarget(event, 'event', 'irgendwas')).rejects.toSatisfy((error) => {
      expect(statusOf(error)).toBe(400)
      expect(codeOf(error)).toBe('unknown_target')
      return true
    })
  })

  it('registrierter Typ + vorhandenes Ziel → geht durch', async () => {
    registerReportTarget('comment', () => true)
    await expect(assertReportTarget(event, 'comment', 'c-1')).resolves.toBeUndefined()
    expect(registeredReportTargets()).toEqual(['comment'])
  })

  it('registrierter Typ, aber Ziel fehlt → 404 target_not_found', async () => {
    registerReportTarget('comment', () => false)
    await expect(assertReportTarget(event, 'comment', 'phantom')).rejects.toSatisfy((error) => {
      expect(statusOf(error)).toBe(404)
      expect(codeOf(error)).toBe('target_not_found')
      return true
    })
  })

  it('eine WERFENDE Prüfung heißt „nicht belegt", nie „schon in Ordnung"', async () => {
    registerReportTarget('comment', () => { throw new Error('Appwrite weg') })
    await expect(assertReportTarget(event, 'comment', 'c-1')).rejects.toSatisfy(
      error => codeOf(error) === 'target_not_found')
  })

  it('die Prüfung bekommt die echte targetId (sonst prüfte sie ins Blaue)', async () => {
    const seen: string[] = []
    registerReportTarget('comment', (_event, id) => { seen.push(id); return true })
    await assertReportTarget(event, 'comment', 'c-42')
    expect(seen).toEqual(['c-42'])
  })

  it('Typen sind getrennt — „post" registriert macht „event" nicht meldbar', async () => {
    registerReportTarget('post', () => true)
    await expect(assertReportTarget(event, 'event', 'e-1')).rejects.toSatisfy(
      error => codeOf(error) === 'unknown_target')
  })
})

describe('der fachliche Grund reist über das Envelope (Befund 3)', () => {
  it('liest error.data.reason — das Feld, das core/server/error.ts setzt', () => {
    expect(reportErrorReason({ data: { reason: 'already_reported' } })).toBe(ALREADY_REPORTED_CODE)
  })

  it('kennt alle drei Gründe des Meldewegs', () => {
    for (const code of REPORT_ERROR_CODES) {
      expect(reportErrorReason({ data: { reason: code } })).toBe(code)
    }
  })

  it('ohne Grund (oder mit fremdem) gibt es null — dann ist es ein echter Fehlschlag', () => {
    expect(reportErrorReason(undefined)).toBeNull()
    expect(reportErrorReason({})).toBeNull()
    expect(reportErrorReason({ data: {} })).toBeNull()
    expect(reportErrorReason({ data: { reason: 'irgendwas' } })).toBeNull()
    expect(reportErrorReason(new Error('Netzwerk'))).toBeNull()
  })

  it('nimmt kein Objekt als Grund an (Envelope lässt nur kurze Schlüssel durch)', () => {
    expect(reportErrorReason({ data: { reason: { code: 'already_reported' } } })).toBeNull()
  })
})
