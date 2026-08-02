import { z } from 'zod'
import { ABUSE_CATEGORIES, normalizeReportedHost } from '../../../../control/shared/abuseReports'
import { callControlPlane } from '../../utils/controlPlane'

/**
 * Eine Community melden (M13, Auslöser 3) — die öffentliche Route.
 *
 * OHNE SESSION, und das ist der Kern: wer Missbrauch meldet, ist fast nie
 * Mitglied der gemeldeten Community, und ein Konto zur Bedingung zu machen
 * hieße, die meisten Meldungen nie zu bekommen. Dieselben Bremsen wie beim
 * Early-Access-Formular: Rate-Limit (core-Middleware, 3/min und IP), Honeypot,
 * strenges Zod-Schema.
 *
 * WO SIE ERREICHBAR IST — und wo bewusst nicht:
 *  - auf den KONTROLL-Hosts (`my.*`, `start.*`): `/api/abuse` steht dafür in
 *    `pukalani.tenancy.controlApiPrefixes`. Das ist das Zuhause des Formulars,
 *    weil ein Kontroll-Host niemandem gehört und deshalb nie gesperrt ist.
 *  - auf jedem LEBENDEN Community-Host, einschließlich der wegen Zahlungsverzug
 *    nur-lesend gesperrten: diese Route berührt keine Mandanten-Tabelle, sie
 *    reicht an das Control Plane weiter — die Datentür sieht sie nie.
 *  - NICHT auf einem wegen Missbrauch gesperrten Host. Der ist vollständig
 *    offline (der Resolver liefert `null`, alles antwortet 404), und das ist
 *    genau der Zweck der Maßnahme. Eine Ausnahme in `00.tenant.ts` wäre ein
 *    Loch in der einen Middleware, die die Mandantengrenze zieht — für einen
 *    Fall, den es nicht gibt: über eine bereits abgeschaltete Community muss
 *    niemand mehr Meldung erstatten, und jede ANDERE ist von `my.pukalani.app`
 *    aus meldbar.
 *
 * Die Antwort ist IMMER `{ ok: true }` — auch beim Honeypot und auch, wenn der
 * gemeldete Host zu keiner Community gehört. Ob eine Adresse existiert, ist
 * nichts, was dieses Formular bestätigen sollte.
 */
const bodySchema = z.object({
  /** Adresse der gemeldeten Community — darf eine volle URL sein. */
  host: z.string().trim().min(1).max(300),
  category: z.enum(ABUSE_CATEGORIES),
  message: z.string().trim().min(10).max(2000),
  /** Optionaler Link auf den beanstandeten Inhalt. */
  url: z.string().trim().max(500).optional(),
  /** Freiwillig — ohne Adresse gibt es keine Rückfrage (das steht auch so im
   *  Formular). */
  reporterEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
  /** Honeypot — muss leer bleiben. Heißt bewusst harmlos. */
  website: z.string().max(200).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.website) {
    logEvent('info', 'abuse.report_honeypot', {})
    return { ok: true }
  }

  const host = normalizeReportedHost(body.host)
  if (!host) {
    // Der EINE Fall, in dem nicht „ok" zurückkommt: der Melder hat etwas
    // eingetippt, das keine Adresse ist. Das ist keine Auskunft über Fremde,
    // sondern eine über seine eigene Eingabe — und ohne sie würde er glauben,
    // die Meldung sei angekommen.
    throw createError({ status: 400, statusText: 'Not a valid host', data: { code: 'invalid_host' } })
  }

  await callControlPlane(event, '/api/control/abuse-reports', {
    host,
    category: body.category,
    message: body.message,
    url: body.url ?? '',
    reporterEmail: body.reporterEmail ?? '',
  })

  return { ok: true }
})
