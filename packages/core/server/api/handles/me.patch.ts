import { z } from 'zod'
import {
  HANDLE_MAX_LENGTH,
  handleChangeAvailableAt,
  handleRejection,
  mayChangeHandleAt,
  normalizeHandle,
} from '../../../shared/handles'
import { activeHandleRow, changeCommunityHandle } from '../../utils/handles'

/**
 * Den eigenen @namen ändern.
 *
 * ── DIE REGELN STEHEN HIER, NICHT IM CLIENT ────────────────────────────────
 * Zeichensatz, reservierte Namen und die 30-Tage-Sperrfrist kommen aus
 * `core/shared/handles.ts` — derselben Datei, die auch die Oberfläche liest.
 * Die Oberfläche KENNT die Regeln (damit sie sofort etwas sagen kann), diese
 * Route SETZT sie durch. Dasselbe Muster wie bei den Schutzregeln des Teams
 * (communityTeam.ts).
 *
 * Ablehnungsgründe reisen als `data: { code }` — der zentrale Fehler-Handler
 * hebt genau diesen Schlüssel als `reason` ins Envelope, die Oberfläche macht
 * daraus einen Satz. Ein blosser 400 ohne Grund wäre hier besonders ärgerlich:
 * „geht nicht" beantwortet weder „welches Zeichen stört" noch „ab wann darf
 * ich wieder".
 */
const bodySchema = z.object({
  handle: z.string().trim().min(1).max(HANDLE_MAX_LENGTH + 1),
})

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const body = await readValidatedBody(event, bodySchema.parse)
  const next = normalizeHandle(body.handle)

  // 1. Gestalt und Reservierung — die reine Regel.
  const rejection = handleRejection(next)
  if (rejection) {
    throw createError({ status: 400, statusText: 'Invalid handle', data: { code: rejection } })
  }

  const current = await activeHandleRow(event, user.$id)

  // 2. Sperrfrist. Die Ausnahme ist bewusst: wer denselben Namen noch einmal
  //    schickt (Doppelklick, erneutes Speichern eines unveränderten Formulars),
  //    soll kein „zu früh" zu sehen bekommen — es ändert sich ja nichts.
  if (current && current.handleLower !== next && !mayChangeHandleAt(current.changedAt || null)) {
    throw createError({
      status: 400,
      statusText: 'Handle change too soon',
      data: { code: 'change_too_soon' },
    })
  }

  // 3. Schreiben. `null` heisst: der eindeutige Index hat gegriffen — der Name
  //    ist vergeben, aktiv ODER als früherer Name eines anderen Menschen.
  const row = await changeCommunityHandle(event, user.$id, body.handle)
  if (!row) {
    throw createError({ status: 409, statusText: 'Handle taken', data: { code: 'taken' } })
  }

  return {
    handle: row.handle,
    changedAt: row.changedAt || null,
    canChange: mayChangeHandleAt(row.changedAt || null),
    availableAt: handleChangeAvailableAt(row.changedAt || null),
  }
})
