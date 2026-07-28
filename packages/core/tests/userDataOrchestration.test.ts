import { describe, expect, it } from 'vitest'
import { publicContributorResults, type ContributorRunResult } from '../server/utils/userDataOrchestration'

/**
 * S8 — die Nutzerlöschung war die EINZIGE Stelle im Dashboard, die
 * „keine Appwrite-Fehlerdetails an Clients leaken" (CLAUDE.md) gebrochen hat.
 *
 * `deleteUserCompletely` sammelt pro Layer eine rohe Fehlermeldung — in aller
 * Regel der Text einer `AppwriteException`, also Tabellen-Ids und interne
 * Formulierungen. `DELETE /api/admin/users/:id` reichte diese Liste
 * unverändert im Antwort-Body durch.
 *
 * Die Entscheidung dahinter: der Client bekommt die BRAUCHBARE Hälfte —
 * welche Layer offen sind, denn dort setzt der Re-Run an — und nicht die
 * diagnostische. Das `error`-Feld bleibt serverseitig (Log).
 */

const results: ContributorRunResult[] = [
  { id: 'comments', ok: true, deleted: 12, anonymized: 3 },
  {
    id: 'system',
    ok: false,
    deleted: 0,
    anonymized: 0,
    error: 'Table with the requested ID could not be found. (notifications)',
  },
]

describe('publicContributorResults', () => {
  it('entfernt die rohe Fehlermeldung aus jedem Eintrag', () => {
    for (const entry of publicContributorResults(results)) {
      expect(entry).not.toHaveProperty('error')
    }
  })

  it('behält, was den Re-Run leitet: Layer, Erfolg und Zählwerte', () => {
    expect(publicContributorResults(results)).toEqual([
      { id: 'comments', ok: true, deleted: 12, anonymized: 3 },
      { id: 'system', ok: false, deleted: 0, anonymized: 0 },
    ])
  })

  it('leakt auch dann nichts, wenn der Text im Serialisieren landet', () => {
    // Der eigentliche Weg nach draußen war JSON.stringify des Bodys —
    // deshalb genau so geprüft, nicht nur über die Objekt-Form.
    expect(JSON.stringify(publicContributorResults(results))).not.toContain('notifications')
    expect(JSON.stringify(publicContributorResults(results))).not.toContain('Table with')
  })

  it('kommt mit einer leeren Liste klar (Instanz ohne Contributors)', () => {
    expect(publicContributorResults([])).toEqual([])
  })
})
