#!/usr/bin/env node
/**
 * A2a — Treiber für den Stripe-Testmodus-Walkthrough (Proben 2–5), gegen PROD
 * im Stripe-TESTMODUS.
 *
 * Was er tut, je nach Kommando:
 *   provision  → Pool-Konto (ohne Passwort, E-Mail als bestätigt markiert) +
 *                Einladungs-Code (control) + Community über die ECHTE
 *                Service-Naht (POST /api/control/onboarding/site) anlegen,
 *                Session ausgeben (Cookie-Wert für a_session_pool).
 *   checkout   → POST /api/community/billing/checkout als Owner → Checkout-URL.
 *   status     → die communities-Row (control) kompakt ausgeben.
 *   portal     → POST /api/community/billing/portal als Owner → Portal-URL.
 *   authz      → Probe 2: Route als Owner (200), ohne Session (401/403/404).
 *
 * Er benutzt AUSSCHLIESSLICH die echten Wege (Naht, Routen, Webhook) — nichts
 * wird an der API vorbei in Tabellen geschrieben, mit EINER Ausnahme: der
 * Einladungs-Code entsteht direkt als Row (das täte sonst der Betreiber im
 * Control-Dashboard, der Weg ist derselbe Datenstand).
 *
 * Secrets kommen aus ~/.appwrite-secrets (nie aus dem Repo):
 *   pool-runtime.key · control-runtime.key · control-onboarding.secret
 *
 * Aufruf (Beispiele):
 *   node scripts/a2a-checkout-driver.mjs provision
 *   node scripts/a2a-checkout-driver.mjs checkout <host> <sessionSecret> personal monthly
 *   node scripts/a2a-checkout-driver.mjs status <host>
 */
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const ENDPOINT = 'https://api.pukalani.app/v1'
const CONTROL_HOST = 'https://control.pukalani.app'
const DATABASE_ID = 'main'

const secret = name => readFileSync(join(homedir(), '.appwrite-secrets', name), 'utf8').trim()

const poolClient = new Client().setEndpoint(ENDPOINT).setProject('pool').setKey(secret('pool-runtime.key'))
const controlClient = new Client().setEndpoint(ENDPOINT).setProject('control').setKey(secret('control-runtime.key'))
const poolUsers = new Users(poolClient)
const controlDb = new TablesDB(controlClient)

const [cmd, ...args] = process.argv.slice(2)

async function provision() {
  const stamp = Date.now().toString(36)
  const email = `a2a-${stamp}@example.com`
  const user = await poolUsers.create({ userId: ID.unique(), email, name: 'A2a Walkthrough' })
  await poolUsers.updateEmailVerification({ userId: user.$id, emailVerification: true })

  const code = `A2A-${randomBytes(6).toString('hex').toUpperCase()}`
  await controlDb.createRow({
    databaseId: DATABASE_ID, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      // `null`, nicht '' — die Datetime-Spalte macht aus '' einen JETZT-Stempel
      // und der Code ist bei der Pruefung bereits abgelaufen (live erwischt).
      label: 'A2a-Walkthrough (Wegwerf)', maxUses: 1, uses: 0, expiresAt: null,
      status: 'active', boundEmail: '', requestId: '', assignedAt: null,
      redeemedAt: null, redeemedSiteId: '',
    },
  })

  const { jwt } = await poolUsers.createJWT({ userId: user.$id })
  const slug = `a2a-probe-${stamp}`
  const res = await fetch(`${CONTROL_HOST}/api/control/onboarding/site`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pukalani-onboarding-secret': secret('control-onboarding.secret'),
    },
    body: JSON.stringify({
      jwt,
      site: {
        name: `A2a Probe ${stamp}`, slug, purpose: 'new', memberRange: 'none',
        category: 'other', goal: 'discussion', vibe: 'calm', inviteCode: code, locale: 'de',
      },
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`onboarding ${res.status}: ${JSON.stringify(body).slice(0, 300)}`)

  const session = await poolUsers.createSession({ userId: user.$id })
  console.log(JSON.stringify({
    userId: user.$id, email, host: body.host || `${slug}.pukalani.app`,
    communityId: body.communityId || body.id || '', sessionSecret: session.secret,
  }, null, 2))
}

const cookieFor = sessionSecret => `a_session_pool=${sessionSecret}`

async function ownerPost(host, sessionSecret, path, payload) {
  const res = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieFor(sessionSecret) },
    body: JSON.stringify(payload ?? {}),
  })
  const body = await res.json().catch(() => ({}))
  console.log(res.status, JSON.stringify(body).slice(0, 500))
}

async function authz(host, sessionSecret) {
  for (const [label, headers] of [
    ['als Owner   ', { cookie: cookieFor(sessionSecret) }],
    ['ohne Session', {}],
  ]) {
    const res = await fetch(`https://${host}/api/community/billing/trial`, { headers })
    console.log(`${label} GET /api/community/billing/trial → ${res.status}`)
  }
}

async function status(host) {
  const { rows } = await controlDb.listRows({
    databaseId: DATABASE_ID, tableId: 'communities',
    queries: [Query.equal('host', host), Query.limit(1)],
  })
  if (!rows.length) { console.log('keine Row für', host); return }
  const r = rows[0]
  console.log(JSON.stringify({
    id: r.$id, host: r.host, plan: r.plan, billingStatus: r.billingStatus ?? '',
    stripeCustomerId: r.stripeCustomerId ?? '', stripeSubscriptionId: r.stripeSubscriptionId ?? '',
    trialEndsAt: r.trialEndsAt ?? null, pastDueSince: r.pastDueSince ?? null,
    suspension: r.suspension ?? '', suspensionReason: (r.suspensionReason ?? '').slice(0, 120),
  }, null, 2))
}

if (cmd === 'provision') await provision()
else if (cmd === 'checkout') await ownerPost(args[0], args[1], '/api/community/billing/checkout', { plan: args[2] || 'personal', interval: args[3] || 'monthly' })
else if (cmd === 'portal') await ownerPost(args[0], args[1], '/api/community/billing/portal')
else if (cmd === 'authz') await authz(args[0], args[1])
else if (cmd === 'status') await status(args[0])
else { console.error('Kommando: provision | checkout | portal | authz | status'); process.exit(1) }
