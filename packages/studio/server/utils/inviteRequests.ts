import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { INVITE_CODES_TABLE, type InviteCodeRow } from '../../shared/types/inviteCode'
import { INVITE_REQUESTS_TABLE, evaluateReminder, type InviteRequestRow } from '../../shared/types/inviteRequest'
import { hashInviteCode, issueCodeValue } from './inviteCodes'

/**
 * Die Warteschlange: Anfrage annehmen, Code zuweisen, erinnern (studio-017).
 *
 * Der Kern-Kniff steht in `assignCode`: **der Betreiber sieht den Klartext
 * nie**. Er klickt „zuweisen", das System nimmt den nächsten freien Code aus
 * dem Vorrat (oder erzeugt einen, wenn der leer ist), bindet ihn an die
 * Adresse der Anfrage und verschickt ihn. Damit existiert das Geheimnis nur
 * zwischen Erzeugung und Mail — in der Datenbank liegt weiter nur sha256.
 *
 * Und der Kniff in `remindCode`: eine Erinnerung kann NICHT denselben Code
 * schicken, weil wir ihn nicht kennen. Sie stellt deshalb einen frischen aus
 * und sperrt den alten. Für den Empfänger unsichtbar (er bekommt einen, der
 * funktioniert); der Nebeneffekt ist gut — ein zwischenzeitlich weitergeleiteter
 * alter Code wird wertlos.
 */

export interface AssignResult {
  /** Klartext — NUR für die Mail, nie in eine Antwort oder ein Log. */
  code: string
  codeId: string
  /** true = aus dem Vorrat genommen, false = frisch erzeugt (Vorrat war leer). */
  fromStock: boolean
}

function databaseId(event: H3Event): string {
  return useRuntimeConfig(event).public.appwriteDatabaseId
}

/** Nächster freier Vorrats-Code: aktiv, an niemanden gebunden, unbenutzt. */
async function takeFromStock(event: H3Event, now: number): Promise<InviteCodeRow | null> {
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<InviteCodeRow>({
    databaseId: databaseId(event),
    tableId: INVITE_CODES_TABLE,
    queries: [
      Query.equal('status', 'active'),
      Query.equal('boundEmail', ''),
      Query.equal('uses', 0),
      Query.orderAsc('$createdAt'),
      Query.limit(10),
    ],
  }).catch(() => ({ rows: [] as InviteCodeRow[] }))

  // Abgelaufene übergehen, statt sie zuzuweisen — sonst bekäme jemand eine
  // Einladung, die beim Öffnen schon tot ist.
  return rows.find(row => !row.expiresAt || Date.parse(row.expiresAt) > now) ?? null
}

/**
 * Vorrats-Code an eine Anfrage binden. Der Klartext eines VORRATS-Codes ist
 * nicht mehr bekannt (nur der Hash) — deshalb wird beim Zuweisen immer ein
 * frischer Wert erzeugt und in die vorhandene Row geschrieben. Der Vorrat ist
 * also ein KONTINGENT, kein Beutel mit fertigen Zetteln; genau so verhält er
 * sich für den Betreiber auch (50 Plätze, X vergeben).
 */
export async function assignCode(
  event: H3Event,
  request: InviteRequestRow,
  options: { expiresInDays?: number } = {},
  now: number = Date.now(),
): Promise<AssignResult> {
  const admin = createAdminClient(event)
  const db = databaseId(event)
  const code = issueCodeValue()
  const expiresAt = new Date(now + (options.expiresInDays ?? 14) * 24 * 60 * 60 * 1000).toISOString()

  const stock = await takeFromStock(event, now)
  const data = {
    codeHash: hashInviteCode(code),
    boundEmail: request.email,
    requestId: request.$id,
    assignedAt: new Date(now).toISOString(),
    expiresAt,
    maxUses: 1,
    uses: 0,
    status: 'active' as const,
  }

  const row = stock
    ? await admin.tablesDB.updateRow<InviteCodeRow>({ databaseId: db, tableId: INVITE_CODES_TABLE, rowId: stock.$id, data })
    : await admin.tablesDB.createRow<InviteCodeRow>({
        databaseId: db,
        tableId: INVITE_CODES_TABLE,
        rowId: ID.unique(),
        data: { ...data, label: `Anfrage ${request.email}` },
      })

  await admin.tablesDB.updateRow<InviteRequestRow>({
    databaseId: db,
    tableId: INVITE_REQUESTS_TABLE,
    rowId: request.$id,
    data: { status: 'assigned', inviteCodeId: row.$id, assignedAt: new Date(now).toISOString() },
  })

  logEvent('info', 'invite.assigned', { requestId: request.$id, codeId: row.$id, fromStock: Boolean(stock) })
  return { code, codeId: row.$id, fromStock: Boolean(stock) }
}

/**
 * Erinnerung: neuer Code, alter gesperrt. Prüft die Bremse (evaluateReminder)
 * und zählt hoch — die Entscheidung selbst ist pur und getestet.
 */
export async function remindCode(
  event: H3Event,
  request: InviteRequestRow,
  now: number = Date.now(),
): Promise<AssignResult> {
  const verdict = evaluateReminder(request, now)
  if (!verdict.allowed) {
    throw createError({ status: 409, statusText: `Reminder not allowed (${verdict.reason})` })
  }

  const admin = createAdminClient(event)
  const db = databaseId(event)

  // Alten Code sperren, BEVOR der neue rausgeht: zwei gültige Codes für
  // dieselbe Adresse wären ein Zustand, den niemand erklären kann.
  if (request.inviteCodeId) {
    await admin.tablesDB.updateRow<InviteCodeRow>({
      databaseId: db, tableId: INVITE_CODES_TABLE, rowId: request.inviteCodeId,
      data: { status: 'revoked' },
    }).catch(() => { /* schon weg — dann ist nichts zu sperren */ })
  }

  const result = await assignCode(event, request, {}, now)

  await admin.tablesDB.updateRow<InviteRequestRow>({
    databaseId: db, tableId: INVITE_REQUESTS_TABLE, rowId: request.$id,
    data: { reminders: (request.reminders ?? 0) + 1, lastReminderAt: new Date(now).toISOString() },
  })

  logEvent('info', 'invite.reminded', { requestId: request.$id, reminders: (request.reminders ?? 0) + 1 })
  return result
}

/**
 * Rückschreibung beim Einlösen: aus „zugewiesen" wird die TATSACHE
 * „eingelöst am … → diese Community". Best effort — die Community existiert
 * bereits, ein fehlgeschlagener Vermerk darf sie nicht scheitern lassen.
 */
export async function markCodeRedeemed(
  event: H3Event,
  code: InviteCodeRow,
  siteId: string,
  now: number = Date.now(),
): Promise<void> {
  const admin = createAdminClient(event)
  const db = databaseId(event)
  const redeemedAt = new Date(now).toISOString()

  await admin.tablesDB.updateRow<InviteCodeRow>({
    databaseId: db, tableId: INVITE_CODES_TABLE, rowId: code.$id,
    data: { redeemedAt, redeemedSiteId: siteId },
  }).catch(error => logEvent('warn', 'invite.redeem_mark_failed', {
    codeId: code.$id, message: error instanceof Error ? error.message : String(error),
  }))

  if (!code.requestId) return
  await admin.tablesDB.updateRow<InviteRequestRow>({
    databaseId: db, tableId: INVITE_REQUESTS_TABLE, rowId: code.requestId,
    data: { status: 'redeemed', redeemedAt, siteId },
  }).catch(error => logEvent('warn', 'invite.request_mark_failed', {
    requestId: code.requestId, message: error instanceof Error ? error.message : String(error),
  }))
}

/**
 * Anfrage annehmen — idempotent über die Adresse (Unique-Index uq_email).
 * Fragt jemand erneut, wird seine bestehende Anfrage aktualisiert statt eine
 * zweite Zeile zu erzeugen. Eine bereits zugewiesene oder eingelöste Anfrage
 * bleibt in ihrem Zustand: eine erneute Anfrage darf keine Zuweisung
 * zurücksetzen.
 */
export async function upsertRequest(
  event: H3Event,
  input: { email: string, note: string, locale: string },
): Promise<{ request: InviteRequestRow, created: boolean }> {
  const admin = createAdminClient(event)
  const db = databaseId(event)
  const email = input.email.trim().toLowerCase()

  const { rows } = await admin.tablesDB.listRows<InviteRequestRow>({
    databaseId: db, tableId: INVITE_REQUESTS_TABLE,
    queries: [Query.equal('email', email), Query.limit(1)],
  })

  const existing = rows[0]
  if (existing) {
    const status = existing.status || 'new'
    const keepStatus = status === 'assigned' || status === 'redeemed'
    const updated = await admin.tablesDB.updateRow<InviteRequestRow>({
      databaseId: db, tableId: INVITE_REQUESTS_TABLE, rowId: existing.$id,
      data: {
        note: input.note || existing.note,
        locale: input.locale || existing.locale,
        // Abgelehnt/zurückgestellt darf durch erneutes Fragen wieder in die
        // Sichtbarkeit rutschen — sonst verschwindet jemand für immer.
        ...(keepStatus ? {} : { status: 'new' }),
      },
    })
    return { request: updated, created: false }
  }

  const created = await admin.tablesDB.createRow<InviteRequestRow>({
    databaseId: db, tableId: INVITE_REQUESTS_TABLE, rowId: ID.unique(),
    data: {
      email,
      note: input.note,
      locale: input.locale,
      status: 'new',
      inviteCodeId: '',
      assignedAt: null,
      redeemedAt: null,
      siteId: '',
      reminders: 0,
      lastReminderAt: null,
    },
  })
  return { request: created, created: true }
}

/** Betreiber-Benachrichtigung: Mail + In-App für alle Operator-Konten. */
export async function notifyOperators(event: H3Event, request: InviteRequestRow): Promise<void> {
  const config = useRuntimeConfig(event)
  const appUrl = (config.public.appUrl || '').replace(/\/+$/, '')
  const link = '/dashboard/invites'

  if (config.alertEmail) {
    await sendMail(event, {
      to: config.alertEmail,
      subject: `[pukalani] Early-Access-Anfrage von ${request.email}`,
      text: [
        `${request.email} möchte Early Access.`,
        request.note ? `\n„${request.note}"\n` : '',
        `Zuweisen im Dashboard: ${appUrl}${link}`,
      ].filter(Boolean).join('\n'),
    }).catch(() => false)
  }

  // In-App für jeden Betreiber (Label admin) — notify() wirft nie.
  try {
    const { users } = createAdminClient(event)
    const { users: operators } = await users.list({ queries: [Query.limit(25)] })
    for (const operator of operators) {
      if (!(operator.labels ?? []).includes('admin')) continue
      await notify(event, {
        recipientId: operator.$id,
        type: 'invite.request',
        title: 'Neue Early-Access-Anfrage',
        body: `${request.email}${request.note ? ` — ${request.note.slice(0, 120)}` : ''}`,
        link,
      })
    }
  }
  catch (error) {
    logEvent('warn', 'invite.notify_failed', { message: error instanceof Error ? error.message : String(error) })
  }
}
