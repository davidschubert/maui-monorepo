import { AppwriteException } from 'node-appwrite'
import { createReportSchema } from '../../../schemas/report'
import { assertReportTarget } from '../../utils/reportTargets'
import { ALREADY_REPORTED_CODE } from '../../../shared/reportErrors'
import { reportRowPermissionOptions } from '../../../shared/reportPermissions'
import { REPORTS_TABLE, type Report } from '../../../shared/types/report'

/**
 * Eine Meldung abgeben.
 *
 * EINE MELDUNG PRO USER/TARGET erzwingt der Unique-Index `reporter_target`.
 * Der zweite Versuch ist ein 409 mit `data.code: 'already_reported'` —
 * NICHT mehr ein 200 mit `{ alreadyReported: true }` (Moderations-Audit
 * Befund 3, 2026-08-01): ein „ok" für etwas, das nicht angelegt wurde, ist
 * dieselbe Klasse Lüge wie der alte `last_admin`-Zweig. Konsumenten haben
 * schon vorher auf 409 verzweigt (EventDetail.vue) — der Zweig war tot, weil
 * die Route nie einen schickte. Jetzt reist der Grund über das etablierte
 * Envelope (`data.code` → `reason`, core/shared/types/error.ts).
 *
 * WER DARF DIE ZEILE LESEN? Das Moderations-Team DIESER Community und der
 * Melder — sonst niemand (Befund 1). Gebildet wird das Publikum zentral über
 * `tenantRowPermissions`, wie bei jeder anderen Pool-Tabelle; vorher standen
 * hier von Hand gesetzte GLOBALE Labels ('admin'/'moderator'). Die waren nach
 * beiden Seiten falsch: ein Kunden-Moderator trägt sie nicht (seine Queue
 * aktualisierte sich also nie live), und ein Betreiber-Label las damit die
 * Meldungen ALLER Communities.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const parsed = createReportSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ status: 400, statusText: 'Invalid report' })
  }
  const input = parsed.data

  // Gibt es das Ziel überhaupt — und ist sein Typ hier meldbar? (Befund 8)
  // Wirft 400 `unknown_target` / 404 `target_not_found`.
  await assertReportTarget(event, input.targetType, input.targetId)

  /**
   * Datentür als OPERATOR — aus zwei Gründen, die beide nichts mit Rechten des
   * Melders zu tun haben:
   *  1. Der Session-Client dürfte Row-Permissions nur setzen, wenn er die
   *     genannten Rollen selbst trägt. Das Moderations-Label trägt der Melder
   *     gerade NICHT — als Mitglied könnte er also seine eigene Meldung nicht
   *     abgeben.
   *  2. M13-Sperre: eine Community mit Zahlungsverzug ist nur-lesend, aber
   *     MELDEN muss weiter gehen. Eine Meldung ist kein Inhalt, sondern der
   *     Hinweis auf ein Problem — sie zu blockieren, bestrafte den Falschen.
   * `reporterId` kommt aus der Session, `tenantId` stempelt die Tür.
   *
   * KEIN `actor:` — UND DAS IST ABSICHT (Trennung `as`/`actor` vom 2026-08-01).
   * Die Regel dort lautet „wer den Admin-Client nur aus technischen Gründen
   * nimmt, obwohl ein Mensch aus der Community handelt, schreibt `actor` hin".
   * Hier gilt sie NICHT, und zwar für beide Regeln, die daran hängen:
   *  - INHALTS-SPERRE: eine Meldung ist kein Inhalt (s. Punkt 2 und die
   *    Begründung in index.delete.ts) — sie muss auch in einer gesperrten
   *    Community abgegeben und zurückgezogen werden können.
   *  - BEITRITT (A5): melden ist kein „Mitmachen". Wer einen Missstand
   *    anzeigt, tritt damit keiner Community bei.
   * `actor` fällt deshalb bewusst auf die Klinke zurück. Wer das auf
   * `actor: 'member'` stellt, dreht Audit-Befund 2 zurück — die zwei Prüfungen
   * in `verify-community-suspension.mjs` gehen dann rot.
   */
  try {
    const report = await tenantDb(event, { as: 'operator' }).create<Report>(REPORTS_TABLE, {
      reporterId: user.$id,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      note: input.note ?? null,
      status: 'open',
      resolvedBy: null,
      resolution: null,
    },
    // Zentrale Permission-Bildung wie bei jeder Pool-Tabelle. Das Publikum
    // selbst steht als pure Funktion in shared/reportPermissions.ts und ist
    // dort an tenantRowPermissionsFor genagelt (tests/reportPermissions.test.ts).
    reportRowPermissionOptions(user.$id))
    // Eskalation (Auto-Hide etc.): Target-Owner-Handler mit aktueller Anzahl
    // offener Meldungen — best-effort, blockiert die Antwort nicht spürbar
    // und darf die abgegebene Meldung nie scheitern lassen.
    await runReportEscalation(event, input.targetType, input.targetId)
    return { ok: true, report }
  }
  catch (error) {
    // Unique-Index getroffen → der User hat dieses Target bereits gemeldet
    if (error instanceof AppwriteException && error.code === 409) {
      throw createError({
        status: 409,
        statusText: 'Already reported',
        data: { code: ALREADY_REPORTED_CODE },
      })
    }
    /**
     * KEIN Catch-all-500 mehr (Befund 6): ein bereits geformter H3-Fehler —
     * etwa die 403-Sperre der Datentür oder ein 404 aus der Ziel-Prüfung —
     * wurde hier zu „Could not submit report", und sein `data.code` (der
     * fachliche Grund) ging dabei verloren. `toH3Error` (core) macht aus
     * Appwrite-Fehlern die passende Statusklasse und lässt H3-Fehler durch.
     */
    throw toH3Error(error, 'Could not submit report')
  }
})
