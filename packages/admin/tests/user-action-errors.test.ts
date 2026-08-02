import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DELETION_INCOMPLETE_CODE,
  LAST_ADMIN_CODE,
  userActionErrorCode,
  userActionErrorKeys,
} from '../shared/userActionErrors'

/**
 * „TOTE FEHLERHÄLFTE" (Audit-Befund 5, 2026-08-02).
 *
 * Eine unvollständige Nutzerlöschung hinterlässt einen GESPERRTEN Account und
 * braucht einen zweiten Lauf. Die Route hängte das als `data.results/failed`
 * an einen 500er — der zentrale Handler hebt aber nur `data.code` als `reason`
 * ins Envelope, es kam also nichts an, und die Oberfläche sagte „Aktion
 * fehlgeschlagen — es gilt weiter der Stand, den du hier siehst". Das war
 * falsch: es galt eben nicht mehr derselbe Stand.
 */
describe('userActionErrorCode', () => {
  it('liest den Grund aus dem Fehler-Envelope', () => {
    expect(userActionErrorCode({ data: { reason: 'last_admin' } })).toBe(LAST_ADMIN_CODE)
    expect(userActionErrorCode({ data: { reason: 'deletion_incomplete' } })).toBe(DELETION_INCOMPLETE_CODE)
  })

  it('gibt null zurück, wenn kein bekannter Grund mitkam', () => {
    expect(userActionErrorCode({ data: { reason: 'irgendwas_anderes' } })).toBeNull()
    expect(userActionErrorCode({ data: {} })).toBeNull()
    expect(userActionErrorCode({})).toBeNull()
    expect(userActionErrorCode(undefined)).toBeNull()
    expect(userActionErrorCode(null)).toBeNull()
    expect(userActionErrorCode(new Error('Netzwerk weg'))).toBeNull()
  })

  it('fällt NICHT auf die alte, nie angekommene Form herein', () => {
    // So sah der 500er bis zum 2026-08-02 aus — hier darf nichts erkannt werden.
    expect(userActionErrorCode({ data: { results: [], failed: ['system'] } })).toBeNull()
  })
})

describe('userActionErrorKeys', () => {
  it('erklärt die Teil-Löschung EIGENSTÄNDIG — nicht als allgemeiner Fehlschlag', () => {
    const keys = userActionErrorKeys(DELETION_INCOMPLETE_CODE)
    expect(keys.title).toBe('admin.users.deletionIncomplete')
    expect(keys.description).toBe('admin.users.deletionIncompleteDesc')
    expect(keys.title).not.toBe(userActionErrorKeys(null).title)
  })

  it('behält den last_admin-Text', () => {
    expect(userActionErrorKeys(LAST_ADMIN_CODE)).toEqual({
      title: 'admin.users.lastAdmin',
      description: 'admin.users.lastAdminDesc',
    })
  })

  it('fällt ohne Grund auf die allgemeine Meldung zurück', () => {
    expect(userActionErrorKeys(null)).toEqual({
      title: 'admin.users.actionFailed',
      description: 'admin.users.actionFailedDesc',
    })
  })
})

/**
 * Ein Schlüssel ohne Text ist wieder eine tote Hälfte — dann zeigt die
 * Oberfläche den rohen i18n-Key. Deshalb beide Sprachen gegen die
 * Locale-Dateien prüfen (Muster: notificationBellTexts.test.ts im Core).
 */
describe('Texte existieren in beiden Sprachen', () => {
  const locales = ['de', 'en'].map(code => ({
    code,
    messages: JSON.parse(readFileSync(
      fileURLToPath(new URL(`../i18n/locales/${code}.json`, import.meta.url)),
      'utf8',
    )) as Record<string, unknown>,
  }))

  function lookup(messages: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>(
      (node, part) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined),
      messages,
    )
  }

  for (const code of [LAST_ADMIN_CODE, DELETION_INCOMPLETE_CODE, null]) {
    const keys = userActionErrorKeys(code)
    for (const { code: locale, messages } of locales) {
      it(`${locale}: ${code ?? 'fallback'} hat Titel und Beschreibung`, () => {
        expect(typeof lookup(messages, keys.title)).toBe('string')
        expect(typeof lookup(messages, keys.description)).toBe('string')
      })
    }
  }
})
