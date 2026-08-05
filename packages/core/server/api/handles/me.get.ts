import { handleChangeAvailableAt, mayChangeHandleAt } from '../../../shared/handles'
import { activeHandleRow, ensureCommunityHandle } from '../../utils/handles'

/**
 * „Wie heisse ich hier?" — und zugleich die VERGABE.
 *
 * Diese Route ist der Grund, warum es KEINE Backfill-Migration gibt, und das
 * ist keine Bequemlichkeit, sondern die einzige Möglichkeit:
 *  - Die Anzeigenamen liegen in Appwrite `users`, nicht in einer Tabelle — ein
 *    Migrations-Skript müsste sie über die Users-API durchblättern.
 *  - Vor allem aber liegt `community_members` (wer gehört zu welcher
 *    Community) im CONTROL PLANE, und das Runtime-Projekt hat dorthin keinen
 *    Schlüssel — dieselbe Grenze wie bei `revokeCommunityLabel` (A5). Eine
 *    Migration im Runtime-Projekt kann die Mitglieder einer Community also gar
 *    nicht aufzählen. Sie könnte nur raten.
 * Vergeben wird deshalb dort, wo beides zusammenkommt: in einem Request, der
 * einen angemeldeten Nutzer UND einen Mandanten-Kontext hat.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  // Erst vergeben (idempotent, wirft nie), dann lesen — so hat auch ein
  // Bestandsnutzer beim ersten Öffnen sofort einen Namen.
  await ensureCommunityHandle(event, user.$id, user.name)
  const row = await activeHandleRow(event, user.$id)

  return {
    handle: row?.handle ?? null,
    changedAt: row?.changedAt || null,
    canChange: mayChangeHandleAt(row?.changedAt || null),
    /** Millisekunden-Zeitstempel oder null („jederzeit"). */
    availableAt: handleChangeAvailableAt(row?.changedAt || null),
  }
})
