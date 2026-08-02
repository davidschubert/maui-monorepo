import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Audit-Befund vom 2026-08-02 — im Wartungsmodus steht JEDER Schreibvorgang
 * still. Auch bei den Terminen.
 *
 * ZUSTAND VORHER: `app_config.maintenanceMode` war im events-Layer an KEINER
 * Route geprüft. comments kennt den Schalter seit jeher (commentPolicy.ts),
 * posts seit S10b an allen fünf Mitglieds-Schreibwegen — events an keinem.
 * Wer den Modus einschaltete, um an den Daten zu arbeiten, sah Kommentare und
 * Beiträge einfrieren, während Termine weiter angelegt, bearbeitet, abgesagt,
 * bebildert, zu- und abgesagt und bewertet wurden.
 *
 * Die Prüfung ist STRUKTURELL, weil der Befund strukturell ist: es fehlte
 * nicht die Logik, sondern ihre Anwendung. Eine neue schreibende Route ohne
 * `assertEventsWritable` bricht diesen Test — und zwar schon an der ersten
 * Erwartung, die die Liste der Schreibwege festnagelt.
 *
 * LESENDE Routen bleiben bewusst offen: der Wartungsmodus soll die Community
 * einfrieren, nicht abschalten (dieselbe Grenze wie in posts).
 */

const apiDir = fileURLToPath(new URL('../server/api/events', import.meta.url))

function routeFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return routeFiles(`${dir}/${entry.name}`, `${prefix}${entry.name}/`)
    return entry.name.endsWith('.ts') ? [`${prefix}${entry.name}`] : []
  })
}

const source = (file: string) => readFileSync(`${apiDir}/${file}`, 'utf8')

/**
 * BEWUSST AUSGENOMMEN: der Reminder-Sweep. Er ist kein Mitglieds-Schreibweg,
 * sondern ein Betreiber-Vorgang hinter `NUXT_EVENTS_SWEEP_KEY`, und er
 * schreibt nur einen Versand-Merker auf fremde Zeilen. Eine verschluckte
 * Terminerinnerung wäre der falsche Preis für eine Wartung — dieselbe
 * Trennung, mit der posts seine Moderations-Routen ausnimmt.
 */
const OPERATOR_ROUTES = new Set(['reminder-sweep.post.ts'])

const memberWriteRoutes = routeFiles(apiDir).filter(file =>
  !file.endsWith('.get.ts') && !OPERATOR_ROUTES.has(file))

describe('Wartungsmodus: jede schreibende Mitglieder-Route prüft ihn', () => {
  it('findet genau die acht Mitglieder-Schreibwege', () => {
    expect([...memberWriteRoutes].sort()).toEqual([
      '[id].delete.ts',
      '[id].patch.ts',
      '[id]/cover.delete.ts',
      '[id]/cover.post.ts',
      '[id]/rsvp.post.ts',
      '[id]/score.post.ts',
      '[id]/series.delete.ts',
      'index.post.ts',
    ].sort())
  })

  it.each(memberWriteRoutes)('%s ruft assertEventsWritable', (file) => {
    expect(source(file)).toContain('assertEventsWritable(event)')
  })
})

describe('Lesende Routen und der Betreiber-Sweep bleiben bewusst offen', () => {
  it.each(routeFiles(apiDir).filter(f => f.endsWith('.get.ts')))('%s friert NICHT ein', (file) => {
    expect(source(file)).not.toContain('assertEventsWritable')
  })

  it('der schlüsselgeschützte Reminder-Sweep friert NICHT ein', () => {
    expect(source('reminder-sweep.post.ts')).not.toContain('assertEventsWritable')
  })
})
