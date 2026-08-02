import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { actorFacesContentLock, actorJoinsByWriting, stripTenantKey } from '../server/utils/tenantDb'

describe('stripTenantKey — der Mandant kommt NIE vom Aufrufer', () => {
  it('entfernt tenantId aus den Daten', () => {
    expect(stripTenantKey({ title: 'Hallo', tenantId: 'fremd' })).toEqual({ title: 'Hallo' })
  })

  it('lässt Daten ohne tenantId unberührt (dieselbe Referenz, kein Kopieren)', () => {
    const data = { title: 'Hallo' }
    expect(stripTenantKey(data)).toBe(data)
  })

  it('entfernt tenantId auch, wenn sie leer oder null ist', () => {
    // Sonst könnte ein durchgereichter Body den Stempel der Tür überschreiben
    // und die Zeile mandantenlos machen — im Pool wäre sie danach für niemanden
    // mehr auffindbar (fail-closed) statt für alle.
    expect(stripTenantKey({ a: 1, tenantId: '' })).toEqual({ a: 1 })
    expect(stripTenantKey({ a: 1, tenantId: null })).toEqual({ a: 1 })
  })

  it('rührt andere Felder nicht an', () => {
    const out = stripTenantKey({ tenantId: 'x', nested: { tenantId: 'bleibt' }, n: 0, f: false })
    expect(out).toEqual({ nested: { tenantId: 'bleibt' }, n: 0, f: false })
  })
})

/**
 * WER HANDELT ≠ WELCHER CLIENT (Audit-Befund 2026-08-01).
 *
 * Die Türklinke (`as`) war nie als Aussage über den Handelnden gemeint — sie
 * sagt nur, mit welchen Zugangsdaten Appwrite angesprochen wird. Trotzdem hingen
 * zwei fachliche Regeln an ihr, und Routen, die den Admin-Client aus TECHNISCHEN
 * Gründen brauchen (Tabelle ohne User-Schreibrechte, Gast ohne Sitzung), meldeten
 * sich damit still von beiden ab. Diese Tests nageln die Trennung fest.
 */
describe('actorFacesContentLock — die M13-Sperre folgt dem Handelnden', () => {
  it('Mitglied und Gast schreiben INHALT und sind in einer gesperrten Community zu', () => {
    expect(actorFacesContentLock('member')).toBe(true)
    // Ein Gast-Kommentar ist Inhalt wie jeder andere — vor der Trennung lief er
    // an der Sperre vorbei, weil er den Admin-Client benutzt.
    expect(actorFacesContentLock('guest')).toBe(true)
  })

  it('Moderation und Betreiber-Sicht kommen durch die Sperre', () => {
    // Davids Grenze: zu ist der INHALT, offen bleiben Branding/Team/Publikum/
    // Registrierung/Moderation. Eine gesperrte Community, die niemand mehr
    // moderieren kann, wird zum Problem des Betreibers.
    expect(actorFacesContentLock('operator')).toBe(false)
  })
})

describe('actorJoinsByWriting — der A5-Beitritt folgt dem Handelnden', () => {
  it('ein Mitglied wird durch sein Schreiben Mitglied', () => {
    expect(actorJoinsByWriting('member')).toBe(true)
  })

  it('ein GAST löst KEINEN Beitritt aus', () => {
    // Er hat kein Konto, dem eine Mitgliedschaft gehören könnte. Genau deshalb
    // reicht ein Ja/Nein nicht: der Gast ist bei der Sperre drin und beim
    // Beitritt draußen.
    expect(actorJoinsByWriting('guest')).toBe(false)
  })

  it('der Betreiber tritt nicht in fremdem Namen bei', () => {
    expect(actorJoinsByWriting('operator')).toBe(false)
  })
})

describe('die Tür selbst', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../server/utils/tenantDb.ts', import.meta.url)),
    'utf8',
  )

  it('lässt den Handelnden auf die Klinke zurückfallen (Bestand bleibt unverändert)', () => {
    expect(source).toContain('options.actor ?? handle')
  })

  it('stellt beide Regeln über den Handelnden, nicht über die Klinke', () => {
    expect(source).toContain('actorFacesContentLock(actor)')
    expect(source).toContain('actorJoinsByWriting(actor)')
    // Die Klinke entscheidet nur noch über den Client.
    expect(source).toContain('handle === \'operator\'')
  })
})
