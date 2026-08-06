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
 *
 * ── UND GENAU DESHALB BRAUCHT SIE EINE WACHE (H1, 2026-08-05) ──────────────
 * Eine Route, die BEIM HINSEHEN vergibt, verteilt Namen an jeden, der hinsieht.
 * Bis hierher fragte sie nur nach der Sitzung: ein Pool-Konto ohne jede
 * Zugehörigkeit bekam auf einem fremden Community-Host eine Zeile, wurde dort
 * kein Mitglied — und belegte den Namen trotzdem für immer. Jetzt vergibt sie
 * nur an Mitglieder (`resolveCommunityMembership`, dieselbe Zugehörigkeit, die
 * auch das Lese-Publikum entscheidet).
 *
 * ABGELEHNT WIRD HIER NICHT MIT EINEM FEHLER, sondern mit einer Auskunft:
 * `member: false` und kein Name. Ein 403 auf eine LESE-Frage hätte die
 * Kontoseite (die auf jedem Host dieselbe ist) mit einer roten Meldung
 * begrüsst, obwohl nichts kaputt ist — „hier hast du keinen Namen" ist eine
 * gültige Antwort, kein Fehler. Der WECHSEL (PATCH) lehnt sehr wohl ab: dort
 * hat jemand etwas vor.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const member = await resolveCommunityMembership(event)
  if (!member) {
    return { handle: null, changedAt: null, canChange: false, availableAt: null, member: false }
  }

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
    /** Gehört dieser Mensch hierher? (H1 — sonst gibt es hier keinen Namen.) */
    member: true,
  }
})
