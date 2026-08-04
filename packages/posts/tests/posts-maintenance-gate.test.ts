import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * S10b — im Wartungsmodus steht JEDER Schreibvorgang still.
 *
 * Der Schalter (app_config.maintenanceMode) war an index.post und
 * [id]/score.post geprüft, an [id].patch, [id].delete und [id]/vote.post
 * nicht. Wer den Modus einschaltet, um Daten anzufassen, hatte damit weiter
 * offene Schreibwege — und zwar genau die unauffälligen: Bearbeiten, Löschen,
 * Abstimmen. Der comments-Layer macht es seit jeher richtig
 * (commentPolicy.assertNotMaintenance friert auch das Löschen EIGENER
 * Kommentare ein); posts zieht nach.
 *
 * Die Prüfung ist strukturell, weil der Befund strukturell ist: es fehlte
 * nicht die Logik, sondern ihre Anwendung. Eine neue schreibende Route ohne
 * Prüfung bricht diesen Test.
 *
 * LESENDE Routen bleiben bewusst offen: der Wartungsmodus soll die Community
 * einfrieren, nicht abschalten — Feed und Warteschlange bleiben lesbar.
 */

const apiDir = fileURLToPath(new URL('../server/api/posts', import.meta.url))

function routeFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return routeFiles(`${dir}/${entry.name}`, `${prefix}${entry.name}/`)
    return entry.name.endsWith('.ts') ? [`${prefix}${entry.name}`] : []
  })
}

const source = (file: string) => readFileSync(`${apiDir}/${file}`, 'utf8')

/**
 * Schreibend = alles außer GET. Die Moderations-Routen (hide/restore/assist)
 * sind BEWUSST ausgenommen: der Wartungsmodus richtet sich an Mitglieder, er
 * darf dem Betreiber nicht das Werkzeug aus der Hand nehmen, mit dem er
 * womöglich gerade aufräumt (dieselbe Trennung wie im comments-Layer, wo die
 * admin-Routen die Policy nicht rufen).
 */
const MODERATION_ROUTES = new Set(['[id]/hide.post.ts', '[id]/restore.post.ts', '[id]/assist.post.ts'])

/**
 * Die Kategorien-Verwaltung (F1, 2026-08-03) — ausgenommen aus GENAU DEMSELBEN
 * Grund, und das ist eine Entscheidung, kein Schlupfloch.
 *
 * Diese drei Routen stehen hinter `posts.manage`, das nur Admin und Owner
 * tragen (communityAuthz.ts). Kein Mitglied kommt hier durch, es gibt also
 * nichts einzufrieren — wohl aber etwas zu verlieren: wer den Wartungsmodus
 * einschaltet, um seine Community zu ordnen, wäre sonst ausgerechnet vom
 * Ordnen ausgesperrt. Dieselbe Grenze zieht M13 an der Datentür (`actor:
 * 'operator'`): Struktur ist Owner-Einstellung, nicht Inhalt.
 *
 * Die ZUSAGE dieses Tests bleibt damit unangetastet — sie lautet „jeder
 * MITGLIEDER-Schreibweg prüft den Schalter", und die Themen-Anlage
 * (index.post.ts) tut das weiterhin.
 */
const CATEGORY_ADMIN_ROUTES = new Set([
  'categories/index.post.ts',
  'categories/[id].patch.ts',
  'categories/[id].delete.ts',
])

const memberWriteRoutes = routeFiles(apiDir).filter(file =>
  !file.endsWith('.get.ts') && !MODERATION_ROUTES.has(file) && !CATEGORY_ADMIN_ROUTES.has(file))

describe('Wartungsmodus: jede schreibende Mitglieder-Route prüft ihn', () => {
  it('findet genau die fünf Mitglieder-Schreibwege', () => {
    expect([...memberWriteRoutes].sort()).toEqual([
      '[id].delete.ts',
      '[id].patch.ts',
      '[id]/score.post.ts',
      '[id]/vote.post.ts',
      'index.post.ts',
    ])
  })

  it.each(memberWriteRoutes)('%s prüft appConfig.maintenanceMode', (file) => {
    expect(source(file)).toContain('maintenanceMode')
  })
})

describe('Lesende Routen bleiben bewusst offen', () => {
  it.each(routeFiles(apiDir).filter(f => f.endsWith('.get.ts')))('%s friert NICHT ein', (file) => {
    expect(source(file)).not.toContain('maintenanceMode')
  })
})
