import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMMUNITY_SUSPENDED_CODE,
  communityIsOffline,
  communityIsReadOnly,
  memberWritesAllowedFor,
  resolveCommunitySuspension,
} from '../shared/communitySuspension'
import { FETCH_ERROR_HOOK } from '../shared/fetchErrorBridge'

/**
 * Die Sperr-Regeln (M13), festgenagelt. An diesen fünf Funktionen hängen drei
 * Stellen, die sich einig sein müssen — Resolver, Datentür und Oberfläche.
 */
describe('resolveCommunitySuspension (fail-open)', () => {
  it('erkennt genau die zwei echten Werte', () => {
    expect(resolveCommunitySuspension('billing')).toBe('billing')
    expect(resolveCommunitySuspension('abuse')).toBe('abuse')
  })

  it('liest Bestand ohne Spalte als „nicht gesperrt"', () => {
    // Appwrite backfillt Spalten-Defaults nicht: Rows von vor control-034
    // lesen sich als null.
    expect(resolveCommunitySuspension(null)).toBe('')
    expect(resolveCommunitySuspension(undefined)).toBe('')
    expect(resolveCommunitySuspension('')).toBe('')
  })

  it('nimmt einen krummen Wert NICHT als Sperre — lieber eine Mahnung zu wenig als eine Community zu Unrecht aus', () => {
    expect(resolveCommunitySuspension('abusive')).toBe('')
    expect(resolveCommunitySuspension('BILLING')).toBe('')
    expect(resolveCommunitySuspension('true')).toBe('')
  })
})

describe('Wirkung der beiden Stufen', () => {
  it('offline ist NUR abuse', () => {
    expect(communityIsOffline('abuse')).toBe(true)
    expect(communityIsOffline('billing')).toBe(false)
    expect(communityIsOffline('')).toBe(false)
  })

  it('nur-lesend ist jede Sperre — abuse defensiv mit drin', () => {
    expect(communityIsReadOnly('billing')).toBe(true)
    expect(communityIsReadOnly('abuse')).toBe(true)
    expect(communityIsReadOnly('')).toBe(false)
  })
})

describe('memberWritesAllowedFor (die Frage der Datentür)', () => {
  it('lässt ohne Mandanten schreiben — Silo, Kontroll-Host, Playground', () => {
    expect(memberWritesAllowedFor(null)).toBe(true)
    expect(memberWritesAllowedFor({})).toBe(true)
  })

  it('schließt bei jeder Sperre zu', () => {
    expect(memberWritesAllowedFor({ suspension: 'billing' })).toBe(false)
    expect(memberWritesAllowedFor({ suspension: 'abuse' })).toBe(false)
    expect(memberWritesAllowedFor({ suspension: '' })).toBe(true)
  })
})

describe('Fehler-Schlüssel', () => {
  it('bleibt stabil — der Client liest ihn als error.data.reason', () => {
    expect(COMMUNITY_SUSPENDED_CODE).toBe('community_suspended')
  })
})

/**
 * DER SCHLÜSSEL BRAUCHT EINEN LESER (Befund 1 des Wechselwirkungs-Audits).
 *
 * Der Fehler, der das ausgelöst hat, war kein falscher Text, sondern gar
 * keiner: `COMMUNITY_SUSPENDED_CODE` reiste sauber bis in den Browser und
 * niemand las ihn — ein Mitglied bekam den generischen Toast seines Layers.
 * Deshalb strukturell geprüft (gleiche Bauart wie notificationBellTexts):
 * es gibt genau EINEN Leser, er benutzt die Konstante statt einer Kopie des
 * Strings, und die Sätze stehen in BEIDEN Sprachen.
 */
describe('Der Schlüssel hat einen Leser im Frontend', () => {
  const REPO = resolve(import.meta.dirname, '../../..')
  const PLUGIN = resolve(REPO, 'packages/core/app/plugins/community-suspended-notice.client.ts')
  const KEYS = ['communitySuspended', 'communitySuspendedHint'] as const

  it('das Plugin vergleicht gegen die KONSTANTE, nicht gegen einen abgeschriebenen String', () => {
    const source = readFileSync(PLUGIN, 'utf8')
    expect(source).toContain('COMMUNITY_SUSPENDED_CODE')
    // Ein wörtliches 'community_suspended' im Plugin wäre eine zweite Wahrheit,
    // die beim Umbenennen der Konstante still stehen bliebe.
    expect(source).not.toContain(`'${COMMUNITY_SUSPENDED_CODE}'`)
  })

  it('hängt am Interceptor der Vorlage, nicht an globalThis.$fetch', () => {
    // Die Falle, die den ersten Versuch scheitern ließ: `#build/fetch.mjs`
    // exportiert eine MOMENTAUFNAHME von `globalThis.$fetch`. Ein Plugin, das
    // das Global ersetzt, erreicht das auto-importierte `$fetch` der
    // Komponenten nicht — und feuert trotzdem manchmal (Konsole, useFetch),
    // sieht also in einem Review richtig aus. Beide Enden der Brücke müssen
    // deshalb denselben Schlüssel benutzen, und der Interceptor muss in der
    // Vorlage stehen.
    expect(readFileSync(PLUGIN, 'utf8')).toContain('FETCH_ERROR_HOOK')
    const config = readFileSync(resolve(REPO, 'packages/core/nuxt.config.ts'), 'utf8')
    expect(config).toContain('FETCH_ERROR_HOOK')
    expect(config).toContain('app:templates')
    // Und niemand darf den Namen abschreiben.
    expect(config).not.toContain(`'${FETCH_ERROR_HOOK}'`)
  })

  it('nennt genau die i18n-Schlüssel, die es in beiden Sprachen gibt', () => {
    const source = readFileSync(PLUGIN, 'utf8')
    for (const locale of ['de', 'en'] as const) {
      const messages = JSON.parse(
        readFileSync(resolve(REPO, `packages/core/i18n/locales/${locale}.json`), 'utf8'),
      ) as { error?: Record<string, string> }
      for (const key of KEYS) {
        expect(source, `Plugin nennt error.${key}`).toContain(`error.${key}`)
        expect(messages.error?.[key], `${locale}: error.${key}`).toBeTruthy()
      }
    }
  })

  it('verrät den GRUND nicht — der ist owner-gegated (GET /api/community/suspension)', () => {
    for (const locale of ['de', 'en'] as const) {
      const messages = JSON.parse(
        readFileSync(resolve(REPO, `packages/core/i18n/locales/${locale}.json`), 'utf8'),
      ) as { error?: Record<string, string> }
      const text = KEYS.map(key => messages.error?.[key] ?? '').join(' ').toLowerCase()
      for (const forbidden of ['zahlung', 'rechnung', 'payment', 'invoice', 'billing', 'missbrauch', 'abuse']) {
        expect(text, `Sperr-Grund im Toast: ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})
