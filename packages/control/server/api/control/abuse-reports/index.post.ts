import { z } from 'zod'
import { ABUSE_CATEGORIES, normalizeReportedHost, normalizeReportedUrl } from '../../../../shared/abuseReports'
import { requireOnboardingCaller } from '../../../utils/onboardingService'
import { createAbuseReport, notifyOperatorsAboutAbuse } from '../../../utils/abuseReports'

/**
 * Eingang einer Missbrauchsmeldung (M13, Auslöser 3) — die Control-Plane-Seite.
 *
 * SERVICE-NAHT wie bei den Early-Access-Anfragen: kein Session-Login, sondern
 * das gemeinsame Secret (`requireOnboardingCaller`). Ein JWT wird bewusst NICHT
 * verlangt — eine Missbrauchsmeldung muss auch von jemandem ohne Konto möglich
 * sein, und das ist der Regelfall: wer eine Community meldet, ist selten
 * Mitglied darin.
 *
 * KEINE AUTOMATISCHE WIRKUNG. Die Meldung legt eine Zeile an und weckt den
 * Betreiber, sonst nichts. Würde sie selbst sperren, wären fünf erfundene
 * Meldungen eine Waffe gegen jede beliebige Community — die Entscheidung
 * gehört zu einem Menschen, und der trifft sie in der Warteschlange.
 */
const bodySchema = z.object({
  host: z.string().trim().min(1).max(300),
  category: z.enum(ABUSE_CATEGORIES),
  message: z.string().trim().min(10).max(2000),
  url: z.string().trim().max(500).optional(),
  reporterEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  // Host UND Link werden HIER noch einmal normalisiert, obwohl die öffentliche
  // Route es schon getan hat: diese Route ist über das Secret erreichbar, also
  // darf sie sich auf nichts verlassen, was vor ihr lag.
  //
  // Der Link stand hier lange NICHT (Audit-Befund): der Host wurde zweimal
  // geprüft, die URL kein einziges Mal — und genau sie landete danach als
  // `href` in der Betreiber-Oberfläche. Ein unbrauchbarer Link leert nur das
  // Feld, er weist die Meldung nie ab.
  const host = normalizeReportedHost(body.host)
  if (!host) throw createError({ status: 400, statusText: 'Not a valid host' })
  const url = normalizeReportedUrl(body.url ?? '')

  const report = await createAbuseReport(event, {
    host,
    category: body.category,
    message: body.message,
    url,
    reporterEmail: body.reporterEmail ?? '',
  })

  await notifyOperatorsAboutAbuse(event, report)
  logEvent('warn', 'abuse.reported', { reportId: report.$id, host, category: body.category, matched: !!report.communityId })

  return { ok: true }
})
