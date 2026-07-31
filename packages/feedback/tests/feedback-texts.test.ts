import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FEEDBACK_AREAS, FEEDBACK_SORTS, FEEDBACK_STATES } from '../../control/shared/customerFeedback'

/**
 * Das Netz unter den drei Aufzählungen des Feedback-Bereichs.
 *
 * Bereiche, Board-Zustände und Sortierungen kommen aus dem VERTRAG (control/
 * shared/customerFeedback.ts) und werden in der Oberfläche über i18n-Keys
 * angezeigt. Ein neuer Wert ohne Text zeigt dem Nutzer den rohen Schlüssel —
 * und zwar still, an der Stelle, an der er am wenigsten hinsieht (ein Filter,
 * eine Spaltenüberschrift). Dieselbe Begründung wie bei
 * core/tests/notificationBellTexts.test.ts: der Rückfall ist unsichtbar,
 * deshalb prüft ihn ein Test.
 *
 * Geprüft wird gegen BEIDE Sprachen — CLAUDE.md verlangt de+en für jeden
 * nutzersichtbaren String, und die Prüfung ist nur dann eine, wenn sie beide
 * Dateien liest.
 */

type Messages = Record<string, unknown>

function load(locale: 'de' | 'en'): Messages {
  const file = fileURLToPath(new URL(`../i18n/locales/${locale}.json`, import.meta.url))
  return JSON.parse(readFileSync(file, 'utf8')) as Messages
}

/** Punkt-Pfad auflösen ('feedback.states.planned'). */
function at(messages: Messages, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) => (typeof node === 'object' && node !== null ? (node as Messages)[key] : undefined),
    messages,
  )
}

/** Alle Blatt-Pfade — für den Vergleich der beiden Sprachen. */
function leaves(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix]
  return Object.entries(node as Messages)
    .flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key))
}

const locales = { de: load('de'), en: load('en') }

describe('Feedback-Texte', () => {
  for (const [code, messages] of Object.entries(locales)) {
    it(`${code}: jeder Bereich hat einen Text`, () => {
      for (const area of FEEDBACK_AREAS) {
        expect(at(messages, `feedback.areas.${area}`), area).toBeTypeOf('string')
      }
    })

    it(`${code}: jeder Board-Zustand hat einen Text`, () => {
      for (const state of FEEDBACK_STATES) {
        expect(at(messages, `feedback.states.${state}`), state).toBeTypeOf('string')
      }
    })

    it(`${code}: jede Sortierung hat einen Text`, () => {
      for (const sort of FEEDBACK_SORTS) {
        expect(at(messages, `feedback.sorts.${sort}`), sort).toBeTypeOf('string')
      }
    })
  }

  it('de und en tragen dieselben Schlüssel', () => {
    expect(leaves(locales.de).sort()).toEqual(leaves(locales.en).sort())
  })
})
