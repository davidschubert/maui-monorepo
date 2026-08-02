import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { ABUSE_REPORTS_TABLE, type AbuseCategory, type AbuseReportRow } from '../../shared/abuseReports'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

/**
 * Missbrauchsmeldungen — die I/O-Seite (M13, Auslöser 3). Die Entscheidungen
 * stehen pur in `shared/abuseReports.ts`; hier steht nur, wie sie in die
 * Datenbank kommen.
 */

export interface IncomingAbuseReport {
  host: string
  category: AbuseCategory
  message: string
  url: string
  reporterEmail: string
}

/**
 * Meldung ablegen. Der gemeldete Host wird EINMAL beim Eingang aufgelöst und
 * als Name mitgeschrieben — nicht bei jedem Blick in die Warteschlange.
 *
 * Warum der Name mitreist, obwohl die Id daneben steht: eine Community kann
 * umbenannt oder gelöscht werden, und dann soll in der Warteschlange trotzdem
 * stehen, worum es ging. Dasselbe Schnappschuss-Prinzip wie `authorName` bei
 * Kommentaren.
 *
 * KEINE Deduplizierung, kein Unique-Index: mehrere Menschen dürfen dieselbe
 * Community melden, und die ZAHL der Meldungen ist selbst ein Signal. Gegen
 * Flut hilft das Rate-Limit auf der öffentlichen Route.
 */
export async function createAbuseReport(event: H3Event, input: IncomingAbuseReport): Promise<AbuseReportRow> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // Auflösung ist NIE Bedingung: ein unbekannter Host (Tippfehler, fremde
  // Domain, gerade gelöschte Community) wird trotzdem angenommen. Den Melder
  // für einen Tippfehler abzuweisen hieße, eine echte Meldung zu verlieren.
  const { rows } = await admin.tablesDB.listRows<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    queries: [Query.equal('host', input.host), Query.limit(1)],
  }).catch(() => ({ rows: [] as TenantRow[] }))
  const community = rows[0]

  return await admin.tablesDB.createRow<AbuseReportRow>({
    databaseId,
    tableId: ABUSE_REPORTS_TABLE,
    rowId: ID.unique(),
    data: {
      host: input.host,
      communityId: community?.$id ?? '',
      communityName: community?.name ?? '',
      category: input.category,
      message: input.message,
      url: input.url,
      reporterEmail: input.reporterEmail,
      status: 'open',
      handledBy: '',
      handledAt: null,
      note: '',
    },
  }).catch((error) => { throw toH3Error(error, 'Could not store report') })
}

/**
 * Den Betreiber wecken — gleiches Muster wie bei den Early-Access-Anfragen
 * (`notifyOperators`): eine Mail an die Alarm-Adresse plus eine In-App-Meldung
 * pro Betreiber-Konto.
 *
 * `scope: 'account'` (C15): eine Missbrauchsmeldung gehört KEINER Community —
 * sie ist eine Aussage über eine, gerichtet an den Betreiber. Sie in die Glocke
 * der gemeldeten Community zu legen wäre grotesk.
 *
 * Wirft nie: eine Meldung, die in der Datenbank steht, ist angekommen — eine
 * fehlgeschlagene Benachrichtigung darf sie nicht rückgängig machen.
 */
export async function notifyOperatorsAboutAbuse(event: H3Event, report: AbuseReportRow): Promise<void> {
  const config = useRuntimeConfig(event)
  const appUrl = (config.public.appUrl || '').replace(/\/+$/, '')
  const link = '/dashboard/abuse'

  if (config.alertEmail) {
    await sendMail(event, {
      to: config.alertEmail,
      subject: `[pukalani] Missbrauchsmeldung zu ${report.host}`,
      text: [
        `Gemeldet: ${report.host}${report.communityName ? ` (${report.communityName})` : ' (keiner Community zugeordnet)'}`,
        `Kategorie: ${report.category}`,
        report.url ? `Link: ${report.url}` : '',
        '',
        report.message,
        '',
        `Sichten im Dashboard: ${appUrl}${link}`,
      ].filter(Boolean).join('\n'),
    }).catch(() => false)
  }

  try {
    for (const operatorId of await listOperatorIds(event)) {
      await notify(event, {
        recipientId: operatorId,
        type: 'abuse.report',
        // title = der gemeldete HOST, kein Satz (C17): die Glocke setzt ihn als
        // {name} in ihren lokalisierten Text ein.
        title: report.host,
        body: report.message.slice(0, 120),
        link,
        scope: 'account',
      })
    }
  }
  catch (error) {
    logEvent('warn', 'abuse.notify_failed', { message: error instanceof Error ? error.message : String(error) })
  }
}
