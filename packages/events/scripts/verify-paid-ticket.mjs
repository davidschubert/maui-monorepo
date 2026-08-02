#!/usr/bin/env node
/**
 * DER GELDPFAD, gegen die ECHTE Instanz — Ticket ausstellen, wiederfinden,
 * zusagen dürfen.
 *
 * WARUM ES DIESES SKRIPT GIBT (Befund vom 2026-08-02): `grantEventTicket()`
 * schrieb nach E8-3 weiter die Spalte `tenantId`, die es in `event_tickets`
 * seit Migration events-008 nicht mehr gibt. Appwrite antwortet darauf
 * `400 row_invalid_structure` — es entstand also KEIN Ticket. Der Kunde
 * zahlte, der Stripe-Webhook wiederholte endlos, und `assertCanRsvpGoing`
 * hielt genau den Zahlenden mit 403 vor der Tür.
 *
 * Gesehen hat es niemand, weil der einzige Beweis ein Unit-Test mit GEMOCKTEM
 * Row-Store war. Ein nachgebauter Speicher hat kein Schema — er nimmt jeden
 * Feldnamen an, den man ihm gibt, und bleibt grün, während die echte Datenbank
 * seit Wochen 400 antwortet. Ein Mock kann eine Schema-Zusage grundsätzlich
 * nicht prüfen; deshalb läuft dieser Beweis gegen die Instanz.
 *
 * WAS HIER ECHT IST: der Quelltext (`server/utils/eventTickets.ts` und die
 * Datentür `core/server/utils/tenantDb.ts` werden per
 * --experimental-strip-types DIREKT importiert, keine Nachbildung), das
 * Appwrite-SDK und die Datenbank. Nachgestellt sind nur die Nitro-
 * Auto-Imports (useRuntimeConfig, createAdminClient, …) — dünne Naht, die
 * genau das liefert, was Nitro auch liefern würde.
 *
 * Aufruf aus packages/events (dort löst node-appwrite auf):
 *
 *   node --experimental-strip-types --env-file=../../apps/comments/.env \
 *        scripts/verify-paid-ticket.mjs
 *
 * Läuft gegen JEDE Instanz mit events-Tabellen (Silo wie Pool) und ist
 * selbst-aufräumend (`finally`). Er braucht keinen Dev-Server: geprüft wird
 * die Server-Schicht, nicht die HTTP-Route darum.
 */
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Client, ID, Query, Storage, TablesDB, Users } from 'node-appwrite'

/**
 * Der Projekt-Quelltext importiert OHNE Dateiendung (`./tenant`) — das ist
 * Bundler-Auflösung, die Node in ESM nicht kennt. Statt die Importe im
 * Produktivcode für ein Beweis-Skript umzuschreiben, bekommt Node hier den
 * fehlenden Schritt: relative Endungslose zeigen auf `.ts`. Damit läuft der
 * ECHTE Quelltext (Datentür inklusive), nicht eine Nachbildung.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.startsWith('file:')) {
      const abs = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
      for (const candidate of [`${abs}.ts`, `${abs}/index.ts`]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)

/**
 * Die Nitro-Naht. Sie muss VOR dem ersten Aufruf stehen (nicht vor dem Import —
 * die Module lesen die Globals erst zur Laufzeit).
 */
const g = globalThis
g.useRuntimeConfig = () => ({ public: { appwriteDatabaseId: databaseId } })
g.createAdminClient = () => ({ tablesDB, users: new Users(client), storage: new Storage(client) })
g.createSessionClient = () => {
  // Fällt laut auf: kein Pfad dieses Beweises darf den Session-Client brauchen
  // (der Webhook hat keine Sitzung, die Tür läuft als 'operator').
  throw new Error('createSessionClient darf hier nie gerufen werden — die Türklinke ist operator')
}
g.createError = (input) => {
  const err = new Error(input.statusText ?? 'Error')
  err.status = input.status
  err.data = input.data
  return err
}
g.toH3Error = (error, statusText) => {
  const err = new Error(statusText)
  err.status = typeof error?.code === 'number' && error.code < 500 ? error.code : 500
  err.cause = error
  return err
}
/** A5-Beitritt: hier nicht Gegenstand, und `find` löst ihn ohnehin nicht aus. */
g.joinCommunity = async () => {}
g.tenantDb = (event, options) => tenantDbReal(event, options)

const { tenantDb: tenantDbReal } = await import('../../core/server/utils/tenantDb.ts')
const { assertCanRsvpGoing, grantEventTicket, hasEventTicket, registerEventTicketGuard }
  = await import('../server/utils/eventTickets.ts')

/** Label-tauglich (alphanumerisch ≤36) — wie in verify-audience-flip. */
const COMMUNITY_A = `tk${Date.now()}a`
const COMMUNITY_B = `tk${Date.now()}b`
const USER_ID = `tkuser${Date.now()}`

/** Der Request-Kontext, den Nitros 00.tenant.ts setzen würde. */
const poolEvent = communityId => ({
  context: { tenant: { mode: 'pool', projectId, tenantId: communityId, communityId } },
})
/** Silo/Single-Tenant: gar kein Mandanten-Kontext. */
const siloEvent = { context: {} }

const created = { events: [], event_tickets: [] }
let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function seedEvent(communityId) {
  const row = await tablesDB.createRow({
    databaseId,
    tableId: 'events',
    rowId: ID.unique(),
    data: {
      title: 'Ticket-Beweis', description: 'Beweis-Termin', startAt: new Date(Date.now() + 86_400_000).toISOString(),
      endAt: null, location: null, url: null, capacity: null, attendeeCount: 0,
      status: 'published', organizerId: 'verify', organizerName: 'verify',
      coverFileId: null, locationType: null, replayUrl: null, address: null, locationNotes: null,
      upvotes: 0, downvotes: 0, score: 0, remindersSentAt: null,
      access: 'paid', priceAmount: 900, priceLookupKey: 'verify_ticket',
      recurrence: '', seriesId: '', seriesIndex: 0, seriesUntil: null, seriesGeneratedUntil: null,
      communityId,
    },
    permissions: [],
  })
  created.events.push(row.$id)
  return row
}

try {
  console.log(`Paid-Ticket-Beweis gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}\n`)

  // ── 0. DAS SCHEMA IST DIE WAHRHEIT ────────────────────────────────────────
  // Diese Prüfung ist der eigentliche Grund für das Skript: sie liest die
  // Spaltenliste aus der Instanz, statt sie zu glauben.
  const { columns } = await tablesDB.listColumns({
    databaseId, tableId: 'event_tickets', queries: [Query.limit(200)],
  })
  const keys = new Set(columns.map(c => c.key))
  check('event_tickets trägt die Spalte communityId', keys.has('communityId'), [...keys].join(','))
  check('event_tickets trägt KEINE Spalte tenantId mehr (events-008)', !keys.has('tenantId'), [...keys].join(','))

  // ── 1. Ausstellen — der Weg des Stripe-Webhooks ───────────────────────────
  const eventA = await seedEvent(COMMUNITY_A)
  // BEWUSST mit dem Silo-Kontext: der Webhook kommt von Stripe, er hat keinen
  // Mandanten-Host. Der Stempel muss trotzdem aus dem EVENT kommen.
  const ticket = await grantEventTicket(siloEvent, {
    eventId: eventA.$id, userId: USER_ID, stripeSessionId: 'cs_verify', amount: 900,
  })
  created.event_tickets.push(ticket.$id)
  check('Ticket entsteht (kein 400 row_invalid_structure)', Boolean(ticket.$id))
  check('das Ticket trägt die communityId SEINES Events', ticket.communityId === COMMUNITY_A, `${ticket.communityId}`)

  // ── 2. Wiederfinden — durch die Datentür, die auf communityId filtert ─────
  check('der Lesepfad findet das eigene Ticket', await hasEventTicket(poolEvent(COMMUNITY_A), eventA.$id, USER_ID))
  check('der NACHBAR findet es nicht', !(await hasEventTicket(poolEvent(COMMUNITY_B), eventA.$id, USER_ID)))
  check('ein anderer Nutzer findet es nicht', !(await hasEventTicket(poolEvent(COMMUNITY_A), eventA.$id, 'wer-anders')))

  // ── 3. Zusagen dürfen — das, wofür bezahlt wurde ──────────────────────────
  registerEventTicketGuard((e, row, userId) => hasEventTicket(e, row.$id, userId))
  let rsvpOk = true
  await assertCanRsvpGoing(poolEvent(COMMUNITY_A), eventA, USER_ID).catch(() => { rsvpOk = false })
  check('mit Ticket ist RSVP „going" erlaubt', rsvpOk)

  let neighbourRefused = false
  await assertCanRsvpGoing(poolEvent(COMMUNITY_B), eventA, USER_ID).catch((error) => {
    neighbourRefused = error?.status === 403
  })
  check('ohne (fremdes) Ticket bleibt es bei 403', neighbourRefused)

  // ── 4. Webhook-Retry: idempotent über den Unique-Index ────────────────────
  const again = await grantEventTicket(siloEvent, {
    eventId: eventA.$id, userId: USER_ID, stripeSessionId: 'cs_verify', amount: 900,
  })
  check('ein zweiter Webhook-Lauf liefert DASSELBE Ticket', again.$id === ticket.$id, `${again.$id} vs ${ticket.$id}`)

  // ── 5. Silo: ohne Mandanten wird der ehrliche Leerwert gestempelt ─────────
  const eventSilo = await seedEvent('')
  const siloTicket = await grantEventTicket(siloEvent, { eventId: eventSilo.$id, userId: USER_ID })
  created.event_tickets.push(siloTicket.$id)
  check('Silo: communityId bleibt leer (keine erfundene Zugehörigkeit)', siloTicket.communityId === '', `'${siloTicket.communityId}'`)
  check('Silo: der Lesepfad findet es (dort gibt es nichts zu scopen)', await hasEventTicket(siloEvent, eventSilo.$id, USER_ID))

  // ── 6. Unlesbares Event ⇒ Fehler statt ungestempeltem Ticket ──────────────
  let threw = false
  await grantEventTicket(siloEvent, { eventId: 'gibt-es-nicht', userId: USER_ID }).catch(() => { threw = true })
  check('unbekanntes Event ⇒ Fehler (Webhook-Retry), kein blindes Schreiben', threw)
}
catch (error) {
  // LAUT scheitern: ohne diesen Zweig verschluckte `finally` mit process.exit()
  // den Fehler und das Skript meldete „alles grün".
  failed++
  console.error('\n✗ Abbruch mit Fehler:', error)
}
finally {
  let removed = 0
  for (const [tableId, ids] of Object.entries(created)) {
    for (const rowId of ids) {
      await tablesDB.deleteRow({ databaseId, tableId, rowId }).then(() => removed++).catch(() => {})
    }
  }
  console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} bestanden, ${failed} fehlgeschlagen (${removed} Test-Rows aufgeräumt)`)
  process.exit(failed === 0 ? 0 : 1)
}
