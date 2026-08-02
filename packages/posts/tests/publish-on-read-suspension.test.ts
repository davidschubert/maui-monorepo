import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * PUBLISH-ON-READ LÄUFT IN EINER GESPERRTEN COMMUNITY WEITER (F25,
 * Entscheidung vom 2026-08-02) — und das ist eine ENTSCHEIDUNG, kein Versehen.
 *
 * Die Gegenseite steht im events-Layer: der Serien-Top-up HÄLT AN
 * (`packages/events/server/utils/eventSeries.ts`, dort mit derselben
 * Begründung von der anderen Seite). Beide Sweeps laufen ohne `actor`, die
 * Inhalts-Sperre der Datentür greift also bei keinem — die Grenze verläuft
 * zwischen ÄNDERN (Sichtbarkeit einer vorhandenen Zeile) und ANLEGEN (neue
 * Zeilen, neues Kontingent).
 *
 * Dieser Test ist der Anker dagegen, dass jemand die Sperre „der Systematik
 * halber" nachrüstet: rot werden soll dann der Test, nicht der Autor, dessen
 * fertiger Beitrag im Zeitplan hängen bleibt.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

describe('publish-on-read und die Sperre', () => {
  const source = read('../server/utils/postsFeed.ts')

  it('fragt die Sperre bewusst NICHT', () => {
    expect(source).not.toContain('memberWritesAllowedFor')
  })

  it('bleibt ohne Handelnden (sonst würde jeder Leser Mitglied)', () => {
    expect(source).not.toContain('tenantDb(event, { as: \'operator\', actor')
  })

  it('die Begründung steht an der Stelle und nennt die Gegenseite', () => {
    expect(source).toMatch(/LÄUFT DIESER SWEEP WEITER \(F25/)
    expect(source).toContain('eventSeries.ts')
  })
})
