import { createHash } from 'node:crypto'
import { PAST_DUE_GRACE_DAYS } from '../../../control/shared/communityBilling'
import { pastDueNoticeTitle, type PastDueCommunityNotice } from '../../../control/shared/pastDueNotice'

/**
 * DIE ZAHLUNGSWARNUNG EINES COMMUNITY-ABOS LANDET IN DER COMMUNITY-GLOCKE
 * (Davids Entscheidung vom 2026-08-03) — und geschrieben wird sie HIER, im
 * Pool, nicht im Webhook.
 *
 * WARUM NICHT IM WEBHOOK: der läuft auf `control`. `metadata.userId` eines
 * Community-Checkouts ist aber eine POOL-Nutzer-Id (der Kunde klickt auf seinem
 * Community-Host, das JWT wird gegen das Runtime-Projekt geprüft) — im
 * control-Projekt gibt es sie nicht (nachgemessen: 404 `user_not_found`). Und
 * das Control Plane hat KEINEN Schlüssel für das Pool-Projekt (dieselbe Grenze,
 * wegen der die RUNTIME `revokeCommunityLabel` zieht und nicht control). Der
 * Webhook KANN die Zeile also nicht anlegen, egal wie man ihn überredet.
 *
 * WARUM EIN SWEEP UND KEINE NEUE NAHT control→platform: die vorhandene Richtung
 * ist platform→control (Service-Naht) plus platform LIEST control (read-only-
 * Cross-Projekt-Key). Diese Warnung braucht genau das und sonst nichts. Eine
 * Gegenrichtung hieße: ein zweites Secret, ein Dienst-Endpunkt auf einem
 * öffentlichen Mehr-Mandanten-Host, und ein Geldpfad, der von der
 * Erreichbarkeit der Platform-App abhängt — der Webhook müsste bei einem
 * Ausfall werfen (Stripe-Regel), also würde ein Platform-Neustart Stripe-Retrys
 * auf den ganzen Geldpfad auslösen. Der Preis dafür wäre Sofortigkeit, und die
 * ist hier wertlos: die Frist bis zur Sperre ist 14 TAGE lang, der Lauf kommt
 * stündlich. Es ist außerdem dieselbe Arbeitsteilung, die M13 schon gewählt hat
 * — der Webhook stempelt (`billingStatus`, `pastDueSince`), der Sweep
 * entscheidet.
 *
 * GENAU EINMAL: über den Idempotenz-Schlüssel von `notify()`. Kein „erst
 * nachsehen, ob schon gemeldet" — zwischen Nachsehen und Schreiben passt ein
 * zweiter Lauf, und dann stünde die Warnung zweimal da. Der Schlüssel enthält
 * `pastDueSince`: derselbe Verzug meldet einmal, ein NEUER Verzug (bezahlt,
 * später wieder offen — der Webhook räumt `pastDueSince` beim `active` ab)
 * meldet wieder.
 */

export interface PastDueNoticeSweepResult {
  /** Wie viele überfällige Communities dieses Projekts der Lauf gesehen hat. */
  checked: number
  /** Hosts, für die in DIESEM Lauf eine neue Warnung entstanden ist. */
  notified: string[]
  /** Communities ohne erreichbaren Owner — die Warnung erreicht niemanden. */
  withoutOwner: string[]
}

/**
 * Der Idempotenz-Schlüssel = die Row-Id der Glocken-Zeile.
 *
 * DREI Bestandteile, jeder nötig:
 *  - `communityId` — pro Community eine Warnung, nicht pro Konto eine für alle.
 *  - `pastDueSince` — pro VERZUGS-EPISODE. Wer bezahlt, dessen Stempel räumt
 *    der Webhook ab; ein späterer Verzug beginnt bei einem neuen Datum und darf
 *    wieder melden. Ohne diesen Teil bekäme dieselbe Community nie eine zweite
 *    Warnung.
 *  - `recipientId` — eine Community kann MEHRERE Owner haben, und eine Meldung
 *    ist an genau einen Empfänger adressiert (die Row-Permissions lassen nur
 *    ihn lesen). Ohne diesen Teil gewönne der erste Owner das Rennen und der
 *    zweite bekäme nie etwas — ein 409, den niemand als Fehler sähe.
 *
 * Gehasht, nicht zusammengeklebt: Appwrite lässt für eine Row-Id nur 36 Zeichen
 * zu, und `communities.$id` allein kann sie schon ausschöpfen. Ein gekürzter
 * Fremdschlüssel wäre eine stille Kollisionsquelle; 28 Hex-Zeichen sind es
 * nicht. Das Präfix bleibt lesbar, damit man einer Zeile im Datenbestand ansieht,
 * woher sie kommt (und `_` am Anfang verbietet Appwrite ohnehin).
 */
export function pastDueNoticeRowId(communityId: string, pastDueSince: string, recipientId: string): string {
  const digest = createHash('sha256').update(`${communityId}|${pastDueSince}|${recipientId}`).digest('hex')
  return `pastdue-${digest.slice(0, 28)}`
}

/**
 * Der Text, den der Owner liest. Kein Betrag und kein Vorwurf — die Zahlen
 * stehen bei Stripe, hier steht der nächste Schritt und die Folge, wenn er
 * ausbleibt. Die Frist kommt aus derselben Konstante, nach der der Sperr-Sweep
 * rechnet: zwei Zahlen wären irgendwann zwei verschiedene.
 */
export const PAST_DUE_NOTICE_BODY = {
  de: `Die Zahlung ist offen. Bitte die Zahlungsmethode aktualisieren — bleibt sie ${PAST_DUE_GRACE_DAYS} Tage offen, wird die Community nur-lesend.`,
  en: `A payment is outstanding. Please update your payment method — after ${PAST_DUE_GRACE_DAYS} days the community becomes read-only.`,
} as const

/** Die Abo-Seite DIESER Community (nicht der Kundenbereich): der Owner liest die
 *  Meldung auf seinem Community-Host, und dort liegt auch der Knopf. */
export const PAST_DUE_NOTICE_LINK = '/dashboard/community/plan'

/** Reentranz-Guard (Single-Instanz-Annahme, wie beim Digest-Sweep). */
let sweepRunning = false

/**
 * Der LESER wird REGISTRIERT, nicht importiert: er braucht den read-only-Key
 * auf das Control Plane, und den kennt nur die App (A14 — genauso verdrahtet
 * wie Tenant-, Rollen- und Host-Resolver). EINE Autorität pro Deployment.
 *
 * Registry statt Parameter, weil es ZWEI Aufrufer gibt: das Intervall-Plugin
 * und die Ops-Route („jetzt melden" ohne eine Stunde zu warten) — dasselbe
 * Paar wie beim Digest-Sweep. Ein durchgereichtes Argument hätte die Route
 * gezwungen, den Schlüssel ein zweites Mal zu kennen.
 */
export type PastDueNoticeReader = (runtimeProjectId: string) => Promise<PastDueCommunityNotice[]>

let reader: PastDueNoticeReader | null = null

export function registerPastDueNoticeReader(fn: PastDueNoticeReader): void {
  if (reader) console.warn('[onboarding] registerPastDueNoticeReader: bestehender Leser wird ersetzt — pro Deployment ist EINER vorgesehen')
  reader = fn
}

/** Ist die Naht überhaupt verdrahtet? (Silo-App, Kontroll-Host, CI-Build ohne
 *  Control-Env — dort gibt es keine Community-Abos zu melden.) */
export function pastDueNoticeAvailable(): boolean {
  return reader !== null
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetPastDueNoticeReader(): void {
  reader = null
}

/**
 * EIN Lauf: überfällige Communities dieses Projekts holen, ihren Owner
 * benachrichtigen (Glocke + Mail-Zweig von `notify()`), Ergebnis melden.
 */
export async function runPastDueNoticeSweep(): Promise<PastDueNoticeSweepResult> {
  const result: PastDueNoticeSweepResult = { checked: 0, notified: [], withoutOwner: [] }
  const read = reader
  if (!read || sweepRunning) return result
  sweepRunning = true
  try {
    const config = useRuntimeConfig()
    const runtimeProjectId = config.public.appwriteProjectId
    const communities = await read(runtimeProjectId)
    result.checked = communities.length
    if (communities.length === 0) return result

    const { users } = createAdminClient()

    for (const community of communities) {
      if (community.ownerUserIds.length === 0) {
        // LAUT, nicht still: eine Community mit offener Zahlung und ohne
        // erreichbaren Owner ist ein Datenfehler, der in 14 Tagen zu einer
        // Sperre führt, die niemand hat kommen sehen.
        result.withoutOwner.push(community.host)
        logEvent('error', 'billing.past_due_notice_without_owner', {
          communityId: community.communityId,
          host: community.host,
        })
        continue
      }

      for (const ownerId of community.ownerUserIds) {
        // Die Sprache ist die des EMPFÄNGERS (prefs.emailLocale) — Bell-Bodies
        // sind gespeicherter Roh-Text, es gibt später keine Übersetzung mehr.
        // Dieselbe Auflösung wie im Webhook; fehlt das Konto, bleibt es bei 'en'
        // und die Zeile entsteht trotzdem (der Empfänger kann existieren und
        // nur unlesbare prefs haben).
        const recipient = await users.get({ userId: ownerId }).catch(() => null)
        if (!recipient) {
          logEvent('error', 'billing.past_due_notice_recipient_missing', {
            communityId: community.communityId,
            host: community.host,
            recipientId: ownerId,
          })
          continue
        }
        const locale = resolveEmailPrefs(recipient.prefs as Record<string, unknown>).emailLocale

        const { created } = await notify(undefined, {
          recipientId: ownerId,
          type: 'billing',
          title: pastDueNoticeTitle(community),
          body: PAST_DUE_NOTICE_BODY[locale],
          link: PAST_DUE_NOTICE_LINK,
          // In DIE Community, nicht in den Kundenbereich (Davids Entscheidung).
          // Der Stempel ist `communities.tenantId` — derselbe Wert, den
          // `scopeRowFor()` in jede Pool-Zeile schreibt.
          scope: 'tenant',
          communityId: community.tenantId,
          // Genau einmal pro Verzugs-Episode.
          rowId: pastDueNoticeRowId(community.communityId, community.pastDueSince, ownerId),
        })
        if (created) {
          result.notified.push(community.host)
          logEvent('warn', 'billing.past_due_notified', {
            communityId: community.communityId,
            host: community.host,
            recipientId: ownerId,
          })
        }
      }
    }
    return result
  }
  finally {
    sweepRunning = false
  }
}
