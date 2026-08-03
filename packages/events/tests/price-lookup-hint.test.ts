import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * F21: Die Allowlist für Einmal-Preise ist scharf (`event_ticket_*` in
 * apps/comments) — und das Muster steht am EINGABEFELD, nicht erst im 400.
 *
 * Warum das ein eigener Test ist: den Schlüssel tippt die Redaktion ein, das
 * Scheitern erlebt der KÄUFER. Eine Allowlist, die man erst am Fehlschlag
 * kennenlernt, ist eine Falle — und der Hinweis fällt genau dann still aus,
 * wenn jemand den i18n-Schlüssel umbenennt oder den Platzhalter vergisst.
 */
const REPO = resolve(import.meta.dirname, '../../..')
const PAGE = resolve(REPO, 'packages/events/app/pages/dashboard/events.vue')

describe('F21 — Hinweis am Preis-Schlüssel-Feld', () => {
  it('das Feld zeigt den berechneten Hilfetext, nicht den festen', () => {
    const source = readFileSync(PAGE, 'utf8')
    expect(source).toContain(':help="priceLookupKeyHelp"')
    // Gegenprobe: der feste Text darf nicht mehr direkt am Feld hängen,
    // sonst wäre die Berechnung totes Gewicht und niemand merkte es.
    expect(source).not.toContain(':help="t(\'events.admin.form.priceLookupKeyHelp\')"')
  })

  it('liest die Muster aus der Config statt sie hinzuschreiben', () => {
    const source = readFileSync(PAGE, 'utf8')
    expect(source).toContain('oneTimeLookupKeys')
    // Ein hartkodiertes Muster in der Oberfläche würde irgendwann etwas
    // versprechen, das die Config gar nicht mehr kennt.
    expect(source).not.toContain('event_ticket_')
  })

  it.each(['de', 'en'])('%s hat den Text MIT Platzhalter', (locale) => {
    const messages = JSON.parse(readFileSync(resolve(REPO, `packages/events/i18n/locales/${locale}.json`), 'utf8'))
    const text = messages.events.admin.form.priceLookupKeyPattern
    expect(typeof text).toBe('string')
    expect(text).toContain('{patterns}')
  })

  it('die Installation, die Tickets verkauft, hat die Liste auch gesetzt', () => {
    // Ohne diese Zeile wäre die ganze Anzeige eine Attrappe: der Hilfetext
    // erschiene nie, weil `oneTimeLookupKeys` leer bliebe.
    const config = readFileSync(resolve(REPO, 'apps/comments/app/app.config.ts'), 'utf8')
    expect(config).toContain('oneTimeLookupKeys')
    expect(config).toContain('event_ticket_*')
    expect(config).toContain('ticketCheckoutPath')
  })
})
