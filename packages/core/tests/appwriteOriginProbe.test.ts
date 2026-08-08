import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  appwriteConsoleHint,
  decidePlatformOutcome,
  interpretOriginProbe,
} from '../shared/appwriteOriginProbe'
import { probeAppwriteOrigin } from '../server/utils/appwritePlatform'

/**
 * F54 (2026-08-08) — der Messwert, an dem eine Kundendomain aktiv wird.
 *
 * Vorher hing die Freischaltung daran, ob wir die Web-Platform über die
 * Projects-API EINTRAGEN konnten. Auf Produktions-Keys geht das nicht
 * (`401 general_unauthorized_scope`), also scheiterte der letzte Schritt dort
 * immer — lokal mit einem Allmachts-Key war alles grün.
 *
 * Jetzt zählt die schlüssellose Probe. Damit ist SIE die Sicherung, und eine
 * zu großzügige Auslegung wäre teurer als der alte Fehler: eine Domain würde
 * aktiv, auf der jede Realtime tot ist — unsichtbar, weil der
 * WebSocket-Handschlag auch einen abgewiesenen Origin mit 101 beantwortet.
 */

describe('interpretOriginProbe', () => {
  it('liest 401 als „Origin akzeptiert" — der Normalfall ohne Sitzung', () => {
    expect(interpretOriginProbe({ kind: 'status', status: 401 })).toBe('accepted')
  })

  it('liest 200 ebenfalls als akzeptiert (die Origin-Prüfung kommt vor der Auth)', () => {
    expect(interpretOriginProbe({ kind: 'status', status: 200 })).toBe('accepted')
  })

  it('liest 403 general_unknown_origin als „Host fehlt"', () => {
    expect(interpretOriginProbe({ kind: 'status', status: 403, type: 'general_unknown_origin' }))
      .toBe('rejected')
  })

  /**
   * Die drei Fälle, die NICHT „akzeptiert" heißen dürfen. Ein Appwrite in
   * Wartung (503) oder ein 403 aus einem anderen Grund würde sonst reihenweise
   * Domains freischalten, deren Live-Aktualisierung tot ist.
   */
  it('sagt bei allem anderen ehrlich „weiß ich nicht"', () => {
    expect(interpretOriginProbe({ kind: 'status', status: 503 })).toBe('inconclusive')
    expect(interpretOriginProbe({ kind: 'status', status: 403, type: 'project_id_missing' }))
      .toBe('inconclusive')
    expect(interpretOriginProbe({ kind: 'error', detail: 'ECONNREFUSED' })).toBe('inconclusive')
  })
})

describe('decidePlatformOutcome', () => {
  const hint = appwriteConsoleHint('portfolio-g4ml')

  /**
   * DER PORTFOLIO-FALL. Die Platforms waren von Hand angelegt, beide Proben
   * antworten 401 — und die Registrierung scheitert trotzdem am Scope. Vorher
   * war das ein Fehlschlag, jetzt ist es der Erfolg, der es immer war.
   */
  it('ist ok, wenn alle Formen akzeptiert sind — auch bei gescheiterter Registrierung', () => {
    expect(decidePlatformOutcome({
      probes: [
        { host: 'www.pukalani.studio', verdict: 'accepted', detail: '401' },
        { host: 'pukalani.studio', verdict: 'accepted', detail: '401' },
      ],
      registration: { ok: false, message: 'Appwrite 401 (general_unauthorized_scope)' },
      consoleHint: hint,
    })).toEqual({ ok: true, message: '' })
  })

  it('nennt bei einem fehlenden Host BEIDES: den Befund und den Handgriff', () => {
    const result = decidePlatformOutcome({
      probes: [
        { host: 'www.pukalani.studio', verdict: 'accepted', detail: '401' },
        { host: 'pukalani.studio', verdict: 'rejected', detail: '403 general_unknown_origin' },
      ],
      registration: { ok: false, message: 'Appwrite 401 (general_unauthorized_scope)' },
      consoleHint: hint,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('pukalani.studio')
    expect(result.message).toContain('general_unauthorized_scope')
    expect(result.message).toContain('Settings → Platforms')
  })

  it('schaltet NICHT frei, wenn die Probe keine Aussage macht', () => {
    const result = decidePlatformOutcome({
      probes: [{ host: 'www.pukalani.studio', verdict: 'inconclusive', detail: 'fetch failed' }],
      registration: { ok: true, message: '' },
      consoleHint: hint,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Nicht messbar')
  })

  it('ist ohne Formen fail-closed', () => {
    expect(decidePlatformOutcome({
      probes: [], registration: { ok: true, message: '' }, consoleHint: hint,
    }).ok).toBe(false)
  })
})

/**
 * DIE PROBE SELBST, gegen einen ECHTEN HTTP-Server.
 *
 * Kein Mock von `fetch`: die Frage ist ja gerade, ob unser Aufruf so beim
 * Server ankommt, wie er soll — mit `Origin`, mit `X-Appwrite-Project` und
 * OHNE Schlüssel. Ein gemocktes fetch hätte genau das nicht beweisen können.
 */
describe('probeAppwriteOrigin gegen ein echtes Appwrite-Double', () => {
  const known = new Set(['https://www.pukalani.studio'])
  let server: Server
  let endpoint = ''
  const seen: { origin: string, project: string, hasKey: boolean }[] = []

  beforeAll(async () => {
    server = createServer((req, res) => {
      const origin = String(req.headers.origin || '')
      seen.push({
        origin,
        project: String(req.headers['x-appwrite-project'] || ''),
        hasKey: Boolean(req.headers['x-appwrite-key']),
      })
      res.setHeader('content-type', 'application/json')
      if (!known.has(origin)) {
        res.statusCode = 403
        res.end(JSON.stringify({ message: 'Invalid Origin', type: 'general_unknown_origin' }))
        return
      }
      res.statusCode = 401
      res.end(JSON.stringify({ message: 'User (role: guests) missing scope (account)', type: 'general_unauthorized_scope' }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  })

  afterAll(async () => {
    // Keep-alive-Sockets zuerst — sonst wartet close() auf sie (CLAUDE.md).
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('erkennt den eingetragenen Host an der 401', async () => {
    expect(await probeAppwriteOrigin(endpoint, 'portfolio-g4ml', 'www.pukalani.studio'))
      .toEqual({ host: 'www.pukalani.studio', verdict: 'accepted', detail: '401 general_unauthorized_scope' })
  })

  it('erkennt den unbekannten Host an der 403', async () => {
    const result = await probeAppwriteOrigin(endpoint, 'portfolio-g4ml', 'nie-gesehen.example')
    expect(result.verdict).toBe('rejected')
    expect(result.detail).toBe('403 general_unknown_origin')
  })

  /**
   * DIE EIGENSCHAFT, AUF DER DER GANZE FIX RUHT: kein Schlüssel im Spiel.
   * Ginge hier ein `X-Appwrite-Key` mit, hinge die Messung wieder an einem
   * Scope — und wir wären zurück beim Fehler des Erstlaufs.
   */
  it('schickt Origin und Projekt — und KEINEN Schlüssel', () => {
    expect(seen.length).toBeGreaterThan(0)
    for (const call of seen) {
      expect(call.project).toBe('portfolio-g4ml')
      expect(call.origin.startsWith('https://')).toBe(true)
      expect(call.hasKey).toBe(false)
    }
  })

  it('macht aus einem toten Endpunkt keine Freigabe', async () => {
    const result = await probeAppwriteOrigin('http://127.0.0.1:9/v1', 'portfolio-g4ml', 'www.pukalani.studio', 1500)
    expect(result.verdict).toBe('inconclusive')
  })

  it('ist ohne Konfiguration ebenfalls fail-closed', async () => {
    expect((await probeAppwriteOrigin('', 'p', 'h')).verdict).toBe('inconclusive')
    expect((await probeAppwriteOrigin(endpoint, '', 'h')).verdict).toBe('inconclusive')
  })
})
