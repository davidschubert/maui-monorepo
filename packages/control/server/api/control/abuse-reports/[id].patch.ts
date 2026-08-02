import { z } from 'zod'
import { ABUSE_REPORTS_TABLE, projectAbuseReport, type AbuseReportRow } from '../../../../shared/abuseReports'
import { setCommunitySuspension } from '../../../utils/communitySuspension'

/**
 * Betreiber: über eine Missbrauchsmeldung entscheiden (M13).
 *
 * ZWEI ENTSCHEIDUNGEN, EIN KNOPF:
 *  - `suspended` sperrt die gemeldete Community in DEMSELBEN Vorgang (Stufe
 *    `abuse`, Host sofort offline) und schreibt die Meldung ab.
 *  - `dismissed` schreibt nur die Meldung ab.
 *
 * Warum das Sperren hier mitgeht und nicht ein zweiter Klick in einer anderen
 * Liste ist: „geprüfte Meldung" heißt genau das — die Prüfung und die Wirkung
 * gehören zusammen, und zwei getrennte Schritte wären zwei Gelegenheiten, den
 * zweiten zu vergessen. Geschrieben wird trotzdem über die EINE Sperr-Funktion
 * (`setCommunitySuspension`), damit auch dieser Weg im Protokoll landet.
 *
 * REIHENFOLGE: erst sperren, dann die Meldung abschreiben. Scheitert das
 * Sperren, bleibt die Meldung offen — sichtbar und wiederholbar. Andersherum
 * wäre eine erledigte Meldung neben einer weiterlaufenden Community die
 * gefährlichere Hälfte.
 *
 * `open` IST DER RÜCKWEG DER MELDUNG, NICHT DER DER SPERRE — bewusst asymmetrisch
 * zu `suspended`. Wer eine Meldung versehentlich abgeschrieben hat, holt sie
 * hiermit zurück in die Warteschlange; eine bereits verhängte Sperre bleibt
 * davon UNBERÜHRT. Zwei Gründe: (1) es gibt keine 1:1-Beziehung — mehrere
 * Meldungen können zu derselben Sperre geführt haben, und ein Rück-Klick auf
 * eine davon dürfte die anderen nicht überstimmen. (2) Entsperren ist ein
 * eigener Vorgang mit eigenem Protokolleintrag (`setCommunitySuspension` über
 * die Sperr-Route in der Communities-Liste). Eine Community, die durch das
 * Zurücksetzen eines Listeneintrags still wieder online geht, wäre genau die
 * unsichtbare Wirkung, die dieses Modul sonst überall vermeidet.
 */
const bodySchema = z.object({
  status: z.enum(['suspended', 'dismissed', 'open']),
  /** Interne Notiz des Betreibers — der Owner sieht sie NIE. */
  note: z.string().trim().max(1000).optional(),
  /** Der Text, den der Owner zu lesen bekommt. Pflicht beim Sperren. */
  reason: z.string().trim().max(500).optional(),
}).strict().refine(
  body => body.status !== 'suspended' || (body.reason ?? '').length >= 5,
  { message: 'A reason is required when suspending', path: ['reason'] },
)

export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing report id' })

  const body = await readValidatedBody(event, bodySchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const report = await admin.tablesDB.getRow<AbuseReportRow>({
    databaseId, tableId: ABUSE_REPORTS_TABLE, rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Report not found') })

  if (body.status === 'suspended') {
    // Ohne aufgelöste Community gibt es nichts zu sperren — das ist kein
    // Serverfehler, sondern eine Auskunft: der gemeldete Host gehört zu keiner
    // Community (Tippfehler, fremde Domain, schon gelöscht). `data.code` trägt
    // den Grund bis in die Oberfläche.
    if (!report.communityId) {
      throw createError({
        status: 409,
        statusText: 'Report has no community',
        data: { code: 'no_community' },
      })
    }
    await setCommunitySuspension(event, {
      communityId: report.communityId,
      suspension: 'abuse',
      reason: body.reason ?? '',
    })
  }

  const updated = await admin.tablesDB.updateRow<AbuseReportRow>({
    databaseId, tableId: ABUSE_REPORTS_TABLE, rowId: id,
    data: {
      status: body.status,
      note: body.note ?? report.note ?? '',
      // 'open' ist der Rückweg (versehentlich abgeschrieben) — dann ist die
      // Meldung wieder unbearbeitet, also auch ohne Bearbeiter.
      handledBy: body.status === 'open' ? '' : (event.context.user?.$id ?? ''),
      handledAt: body.status === 'open' ? null : new Date().toISOString(),
    },
  }).catch((error) => { throw toH3Error(error, 'Could not update report') })

  logEvent('info', 'abuse.report_handled', { reportId: id, status: body.status, host: report.host })
  return projectAbuseReport(updated)
})
