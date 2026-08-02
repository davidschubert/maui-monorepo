import { describe, expect, it } from 'vitest'
import { realtimeAllowed } from '../shared/realtimeGate'

/**
 * Das Realtime-Gate (F14, 2026-08-01) — die pure Regel hinter allen
 * Realtime-Einstiegen des Core (useRealtimeRows, usePresence/-State,
 * useRealtimeAccount, ensureRealtimeJwt).
 *
 * Zu beweisen sind genau die drei Entscheidungen:
 * 1. Core-Default ist AN (fehlender Schlüssel ≠ aus) — sonst entkoppelte ein
 *    Deploy stillschweigend jede Produkt-App von ihren Live-Updates.
 * 2. Ein ausdrückliches `false` schlägt ALLES, auch eine vorhandene Datenebene.
 * 3. Die Datenebene bleibt eigenständiges Ausschlusskriterium — ein gesetztes
 *    Gate heilt keine fehlende Datenbank-/Tabellen-Id (Live-Vorfall
 *    2026-07-29: leerer Kanal ⇒ „Channel ID is required" ⇒ 500 im Browser).
 */
describe('realtimeAllowed', () => {
  it('erlaubt ohne gesetztes Gate (Core-Default AN)', () => {
    expect(realtimeAllowed(undefined)).toBe(true)
    expect(realtimeAllowed(undefined, 'main', 'app_config')).toBe(true)
  })

  it('erlaubt bei ausdrücklichem true', () => {
    expect(realtimeAllowed(true, 'main', 'app_config')).toBe(true)
  })

  it('verbietet bei ausdrücklichem false — auch mit vollständiger Datenebene', () => {
    expect(realtimeAllowed(false)).toBe(false)
    expect(realtimeAllowed(false, 'main', 'app_config')).toBe(false)
  })

  it('verbietet ohne Datenebene, obwohl das Gate offen ist', () => {
    // Apps ohne eigene Appwrite-Instanz: appwriteDatabaseId ist der leere Default.
    expect(realtimeAllowed(true, '', 'app_config')).toBe(false)
    expect(realtimeAllowed(true, 'main', '')).toBe(false)
    expect(realtimeAllowed(undefined, undefined)).toBe(false)
  })

  it('prüft JEDE übergebene Id, nicht nur die erste', () => {
    expect(realtimeAllowed(true, 'main', 'app_config', '')).toBe(false)
    expect(realtimeAllowed(true, 'https://appwrite.example/v1', 'proj')).toBe(true)
  })
})
