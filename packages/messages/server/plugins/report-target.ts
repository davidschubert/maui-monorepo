import { MESSAGE_REPORT_TARGET } from '../../shared/types/message'

/**
 * MELDBAR: private Nachrichten — UND die Warteschlange dazu. Beides oder
 * keins (Konzept § 2.1).
 *
 * ── DIE REGISTRIERUNG IST EIN VERSPRECHEN ────────────────────────────────
 * Der Kopf von `packages/moderation/server/utils/reportTargets.ts` sagt es
 * beim Namen: „ein `targetType`, den niemand moderiert, ist ein VERSPRECHEN
 * INS LEERE." Genau das war bei Events der Fall — der Melde-Knopf sagte „ein
 * Moderator sieht sie sich an", und keine Queue kannte den Typ. Deshalb
 * registriert dieser Layer den Typ NUR, weil er auch `/dashboard/
 * message-reports` und `/api/messages/moderation/*` mitbringt.
 *
 * ── DIE PRÜFUNG LÄUFT DURCH DIE DATENTÜR ─────────────────────────────────
 * Eine Nachricht aus einer FREMDEN Community ist damit „nicht vorhanden", eine
 * erfundene Id ebenso — fail-closed, ohne dass diese Datei etwas über
 * Mandanten wissen müsste.
 *
 * ── DER ESKALATIONS-HANDLER FRIERT DEN BELEG EIN ─────────────────────────
 * Er wird nach JEDER neuen Meldung gerufen; geschrieben wird bei der ERSTEN
 * (Begründung in `shared/messageReport.ts`). Das ist der Moment, in dem eine
 * private Nachricht überhaupt lesbar wird — vorher und ohne ihn gibt es für
 * die Moderation nichts zu sehen.
 *
 * KEIN AUTO-HIDE. Anders als bei Kommentaren und Beiträgen führt eine
 * Meldungs-Schwelle hier zu nichts: eine private Nachricht hat kein Publikum,
 * das man vor ihr schützen könnte, und sie dem EMPFÄNGER auszublenden nähme
 * ihm den Beleg, den er gerade selbst gemeldet hat. Die Konsequenz einer
 * bestätigten Belästigung ist die Sperre (durch den Empfänger) und die
 * Rollen-/Konto-Maßnahme (durch den Stab) — beides gibt es bereits.
 */
export default defineNitroPlugin(() => {
  registerReportTarget(MESSAGE_REPORT_TARGET, async (event, targetId) => messageExists(event, targetId))

  registerReportEscalationHandler(MESSAGE_REPORT_TARGET, async (event, context) => {
    await freezeReportedMessage(event, context.targetId)
  })
})
