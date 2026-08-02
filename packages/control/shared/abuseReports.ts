import type { Models } from 'node-appwrite'

/**
 * Missbrauchsmeldungen (M13, Auslöser 3) — der PURE Vertrag.
 *
 * „Kleinste ehrliche Lösung": ein öffentliches Formular, eine Zeile im Control
 * Plane, eine Warteschlange im Betreiber-Dashboard. KEINE automatische Sperre
 * durch eine Meldung — der Betreiber entscheidet, und erst diese Entscheidung
 * schaltet ab. Sonst wäre eine Handvoll erfundener Meldungen eine Waffe gegen
 * jede beliebige Community.
 *
 * WARUM DIE ZEILE IM CONTROL PLANE LIEGT und nicht bei der gemeldeten Community:
 * eine Meldung ist eine Aussage ÜBER die Community, nicht ihr Inhalt. Läge sie
 * in deren Datenraum, könnte der Beschuldigte sie lesen und löschen. (Dieselbe
 * Herleitung wie bei `customer_feedback`, control-032.)
 *
 * ABGRENZUNG ZU `moderation` (reports): das ist die Meldung EINES BEITRAGS an
 * die Moderatoren DERSELBEN Community — von innen nach innen. Hier geht es um
 * eine ganze Community, gemeldet von außen, gerichtet an den Betreiber. Zwei
 * verschiedene Empfänger, zwei verschiedene Warteschlangen.
 */

export const ABUSE_REPORTS_TABLE = 'abuse_reports'

/**
 * Wovon handelt die Meldung? Bewusst KURZ und laienverständlich — die Liste
 * steht als Auswahl in einem Formular, das jeder ausfüllen können muss. Sie
 * sortiert nur vor; entscheiden muss ohnehin ein Mensch.
 */
export const ABUSE_CATEGORIES = ['illegal', 'harassment', 'spam', 'impersonation', 'copyright', 'other'] as const
export type AbuseCategory = (typeof ABUSE_CATEGORIES)[number]

/**
 * Drei Zustände, mehr nicht: liegt an · hat zur Sperre geführt · war nichts
 * dran. Ein „in Bearbeitung" gäbe es nur, damit es existiert — bei einem
 * Betreiber ist die Warteschlange entweder leer oder er sitzt gerade davor.
 */
export const ABUSE_REPORT_STATUSES = ['open', 'suspended', 'dismissed'] as const
export type AbuseReportStatus = (typeof ABUSE_REPORT_STATUSES)[number]

export function isAbuseCategory(value: unknown): value is AbuseCategory {
  return typeof value === 'string' && (ABUSE_CATEGORIES as readonly string[]).includes(value)
}

export function isAbuseReportStatus(value: unknown): value is AbuseReportStatus {
  return typeof value === 'string' && (ABUSE_REPORT_STATUSES as readonly string[]).includes(value)
}

/** Row-Typ zur `abuse_reports`-Table (Schema: Migration control-034). */
export interface AbuseReportRow extends Models.Row {
  host: string
  communityId: string | null
  communityName: string | null
  category: string
  message: string
  url: string | null
  reporterEmail: string | null
  status: string
  handledBy: string | null
  handledAt: string | null
  note: string | null
}

/** Was die Warteschlange des Betreibers über EINE Meldung zeigt. */
export interface AbuseReportView {
  id: string
  createdAt: string
  host: string
  /** '' = der gemeldete Host gehört zu keiner Community (Tippfehler, alte
   *  Adresse, fremde Domain). Die Meldung wird trotzdem angenommen — abweisen
   *  hieße, den Melder für einen Tippfehler zu bestrafen. */
  communityId: string
  communityName: string
  category: AbuseCategory
  message: string
  url: string
  reporterEmail: string
  status: AbuseReportStatus
  handledAt: string | null
  note: string
}

/**
 * PURE (unit-getestet): Row → Ansicht. Unbekannte Kategorien/Zustände (Bestand,
 * Tippfehler) fallen auf 'other' bzw. 'open' zurück, statt die Liste mit einem
 * leeren Feld zu rendern — eine Meldung, die wegen eines krummen Spaltenwerts
 * unsichtbar wird, ist der teuerste Fehler, den diese Warteschlange machen kann.
 */
export function projectAbuseReport(row: AbuseReportRow): AbuseReportView {
  return {
    id: row.$id,
    createdAt: row.$createdAt,
    host: row.host,
    communityId: row.communityId ?? '',
    communityName: row.communityName ?? '',
    category: isAbuseCategory(row.category) ? row.category : 'other',
    message: row.message,
    url: row.url ?? '',
    reporterEmail: row.reporterEmail ?? '',
    status: isAbuseReportStatus(row.status) ? row.status : 'open',
    handledAt: row.handledAt ?? null,
    note: row.note ?? '',
  }
}

/** Kennzahlen über der Liste — offen zuerst, das ist die Arbeit. */
export interface AbuseReportStats {
  open: number
  suspended: number
  dismissed: number
  total: number
}

/** PURE (unit-getestet). */
export function summarizeAbuseReports(reports: readonly AbuseReportView[]): AbuseReportStats {
  return {
    open: reports.filter(r => r.status === 'open').length,
    suspended: reports.filter(r => r.status === 'suspended').length,
    dismissed: reports.filter(r => r.status === 'dismissed').length,
    total: reports.length,
  }
}

/**
 * PURE (unit-getestet): Eingabe des Formulars → kanonischer Host.
 *
 * Menschen tippen `https://beispiel.pukalani.app/beitrag/3` oder
 * `Beispiel.Pukalani.App ` — beides meint denselben Host. Die Normalisierung
 * gehört hierher und nicht in die Route, weil das Formular denselben Wert
 * anzeigen soll, den der Betreiber später in der Warteschlange liest. Gibt ''
 * zurück, wenn nichts Host-artiges übrig bleibt (die Route weist das ab).
 */
export function normalizeReportedHost(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return ''
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  const hostPart = (withoutScheme.split('/')[0] ?? '').split('?')[0] ?? ''
  const withoutPort = hostPart.split(':')[0] ?? ''
  const host = withoutPort.endsWith('.') ? withoutPort.slice(0, -1) : withoutPort
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : ''
}
