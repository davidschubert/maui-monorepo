import { describe, expect, it } from 'vitest'
import { domainReasonFrom } from '../shared/types/error'
import type { ContributorRunResult } from '../server/utils/userDataOrchestration'

/**
 * DIE NUTZERLÖSCHUNG UND IHRE ANTWORT — zwei Lektionen, eine Datei.
 *
 * S8 (2026-07-27): `deleteUserCompletely` sammelt pro Layer eine ROHE
 * Fehlermeldung — in aller Regel der Text einer `AppwriteException`, also
 * Tabellen-Ids und interne Formulierungen. `DELETE /api/admin/users/:id`
 * reichte diese Liste unverändert im Antwort-Body durch. Die Antwort damals:
 * eine entschärfte Sicht (`publicContributorResults`).
 *
 * Audit 2026-08-02: die entschärfte Sicht kam beim Client NIE an. Der zentrale
 * Fehler-Handler holt aus `data` ausschließlich `code` heraus — alles andere
 * verwirft er (genau dafür ist er da). Die Route hängte also eine Sammlung an
 * einen 500er, die niemand je sah, und die Oberfläche meldete „Aktion
 * fehlgeschlagen", während der Nutzer in Wahrheit GESPERRT zurückblieb und ein
 * zweiter Lauf nötig war. Seither reist EIN Grund (`deletion_incomplete`), die
 * Diagnose steht im Log — und `publicContributorResults` ist entfallen.
 *
 * Diese Tests halten beide Lektionen fest: die rohen Ergebnisse kommen durch
 * das Envelope NICHT nach draußen, der Grund schon.
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

describe('Antwort einer unvollständigen Nutzerlöschung', () => {
  it('trägt den fachlichen Grund — die Oberfläche kann „gesperrt, bitte erneut" sagen', () => {
    expect(domainReasonFrom({ code: 'deletion_incomplete' })).toBe('deletion_incomplete')
  })

  it('trägt die Contributor-Ergebnisse NICHT — auch nicht als `data` angehängt', () => {
    // Genau die Form, die die Route bis zum 2026-08-02 mitschickte.
    expect(domainReasonFrom({ results, failed: ['system'], exportFileId: 'file_1' })).toBeNull()
  })

  it('lässt die rohe Fehlermeldung auch dann nicht durch, wenn sie unter `code` steht', () => {
    expect(domainReasonFrom({ code: results[1]!.error })).toBeNull()
  })
})
