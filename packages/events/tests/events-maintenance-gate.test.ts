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
 * BEWUSST AUSGENOMMEN — alles, was kein MITGLIEDS-Schreibweg ist:
 *
 *  - der Reminder-Sweep: ein Betreiber-Vorgang hinter `NUXT_EVENTS_SWEEP_KEY`,
 *    der nur einen Versand-Merker auf fremde Zeilen schreibt. Eine verschluckte
 *    Terminerinnerung wäre der falsche Preis für eine Wartung.
 *  - die MODERATIONS-Routen (F15, 2026-08-03; Schwärzen kam mit F46 dazu):
 *    Ausblenden, Wiederherstellen und Schwärzen laufen hinter `events.moderate`
 *    mit der Türklinke `operator` — sie sind ein Urteil über fremden Inhalt,
 *    kein Mitglieds-Schreibvorgang. Sie einzufrieren hieße, eine Community, an der gerade
 *    gearbeitet wird, unmoderierbar zu machen; das ist dieselbe Trennung, die
 *    M13 für die Zahlungs-Sperre trifft („eine gesperrte Community, die niemand
 *    mehr moderieren kann, wird zum Problem des Betreibers") — und exakt die,
 *    auf die dieser Kommentar schon vorher mit „dieselbe Trennung, mit der posts
 *    seine Moderations-Routen ausnimmt" verwiesen hat.
 */
const OPERATOR_ROUTES = new Set([
  'reminder-sweep.post.ts',
  '[id]/hide.post.ts',
  '[id]/restore.post.ts',
  '[id]/redact.post.ts',
])

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

describe('Lesende Routen, der Betreiber-Sweep und die Moderation bleiben bewusst offen', () => {
  it.each(routeFiles(apiDir).filter(f => f.endsWith('.get.ts')))('%s friert NICHT ein', (file) => {
    expect(source(file)).not.toContain('assertEventsWritable')
  })

  it.each([...OPERATOR_ROUTES])('%s friert NICHT ein (kein Mitglieds-Schreibweg)', (file) => {
    expect(source(file)).not.toContain('assertEventsWritable')
  })

  it('die Moderations-Routen tragen dafür die Moderations-Capability', () => {
    // Die Ausnahme oben ist nur zulässig, WEIL diese Routen anders gesichert
    // sind. Ohne diese Erwartung könnte man jede Route durch Eintrag in
    // OPERATOR_ROUTES aus dem Wartungsmodus herausdefinieren.
    for (const file of ['[id]/hide.post.ts', '[id]/restore.post.ts', '[id]/redact.post.ts']) {
      expect(source(file)).toContain('requireCommunityPermission(event, \'events.moderate\')')
      expect(source(file)).toContain('as: \'operator\'')
    }
  })
})
