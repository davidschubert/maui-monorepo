import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hasCapability } from '../../core/shared/authz'

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

/**
 * DIE EINE AUSNAHME (Paritäts-Audit 2026-08-02): `settings.patch.ts` schreibt
 * nicht auf dem Board, sondern in `app_config/global` — die EINE
 * Einstellungszeile des Projekts. Sie verlangt deshalb `system.manage` wie
 * jeder andere app_config-Schreiber. Als Aufzählung geschrieben, damit eine
 * weitere Ausnahme eine bewusste Entscheidung bleibt statt eines Nebenwegs.
 */
const OPERATOR_ONLY = new Map([
  ['settings.patch.ts', 'system.manage'],
])

describe('Jede tickets-Route trägt ihren Gate selbst', () => {
  it('findet überhaupt Routen (sonst prüft der Test nichts)', () => {
    expect(files.length).toBeGreaterThanOrEqual(21)
  })

  it.each(files)('%s ruft requirePermission mit ihrer Capability', (file) => {
    const capability = OPERATOR_ONLY.get(file) ?? 'tickets.manage'
    expect(source(file)).toContain(`requirePermission(event, '${capability}')`)
  })

  it('die Ausnahme-Liste zeigt auf existierende Dateien', () => {
    for (const file of OPERATOR_ONLY.keys()) expect(files).toContain(file)
  })
})

/**
 * WARUM DIE AUSNAHME NÖTIG IST — der Befund selbst, festgenagelt.
 *
 * `tickets.manage` liegt im Moderator-Bündel (authz.ts, bewusst: Karten-
 * Mitglieder sind Mods). Solange die Instanz-Einstellung an dieser Capability
 * hing, konnte ein Moderator das KI-Modell der GANZEN Instanz umstellen —
 * jede Triage lief danach auf Kosten des Betreibers über sein Modell.
 */
describe('Instanz-Einstellungen sind Betreiber-Sache', () => {
  it('ein Moderator trägt tickets.manage, aber NICHT system.manage', () => {
    expect(hasCapability(['moderator'], 'tickets.manage')).toBe(true)
    expect(hasCapability(['moderator'], 'system.manage')).toBe(false)
  })

  it('der einzige app_config-Schreiber der tickets ist der operator-Gate', () => {
    for (const file of files) {
      if (!source(file).includes('app_config')) continue
      expect(OPERATOR_ONLY.get(file)).toBe('system.manage')
    }
  })

  it('das Modal fragt die Route, ob es die Knöpfe zeigen darf', () => {
    expect(source('settings.get.ts')).toContain('canEditModel')
  })
})
