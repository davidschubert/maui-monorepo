import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * S10c — der Gate gehört in die ROUTE, nicht (nur) in den Util.
 *
 * `POST /api/tickets/:id/triage` war eine ungeprüfte Weiterleitung: die
 * Autorisierung steckte ausschließlich in `triageTicket()`
 * (server/utils/ticketTriage.ts). Kein Loch — aber eine Falle. Wer das Util
 * refactort, splittet oder einen zweiten Aufrufer bedient, öffnet still einen
 * Mutations-Endpunkt, der pro Aufruf ein KI-Modell bezahlt und die
 * Ticket-Beschreibung überschreibt.
 *
 * Diese Suite hält die Regel fest, statt nur den einen Fall: JEDE Route unter
 * server/api/tickets prüft `tickets.manage` in ihrer eigenen Datei. Eine neue
 * Route, die sich auf einen Guard „weiter unten" verlässt, bricht den Test.
 *
 * Warum `requirePermission` und nicht `requireCommunityPermission`: das Ticket-Board
 * ist BETREIBER-Werkzeug (Entwicklungs-Board), keine Kunden-Site-Fläche —
 * `tickets.manage` ist eine Operator-Capability (authz.ts), keine der fünf
 * Site-Rollen trägt sie. Bewusst label-only.
 */

const apiDir = fileURLToPath(new URL('../server/api/tickets', import.meta.url))

function routeFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return routeFiles(`${dir}/${entry.name}`, `${prefix}${entry.name}/`)
    return entry.name.endsWith('.ts') ? [`${prefix}${entry.name}`] : []
  })
}

const files = routeFiles(apiDir)
const source = (file: string) => readFileSync(`${apiDir}/${file}`, 'utf8')

describe('Jede tickets-Route trägt ihren Gate selbst', () => {
  it('findet überhaupt Routen (sonst prüft der Test nichts)', () => {
    expect(files.length).toBeGreaterThanOrEqual(21)
  })

  it.each(files)('%s ruft requirePermission(event, \'tickets.manage\')', (file) => {
    expect(source(file)).toContain('requirePermission(event, \'tickets.manage\')')
  })
})
