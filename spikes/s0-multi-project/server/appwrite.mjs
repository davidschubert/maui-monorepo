/**
 * S0-Vertrag 2 + 3: Client-Factories nehmen das EVENT (statt statischer
 * runtimeConfig) — und der Runtime-Key liegt NIE im Request-Kontext,
 * sondern nur hinter diesem server-internen Secret-Resolver.
 *
 * Spiegelt das Zwei-Client-Muster aus packages/core/server/lib/appwrite.ts:
 *   createSessionClient(event)  → User-Session, Row Permissions bleiben wirksam
 *   getSystemClient(siteId, scope) → Admin-Key, nur enumerierte System-Ops
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCookie } from 'h3'
import { Client, Account, Users } from 'node-appwrite'

const here = dirname(fileURLToPath(import.meta.url))
// Secrets leben in einem eigenen Modul-Scope — kein Export, kein event-Anhang.
const secrets = JSON.parse(readFileSync(resolve(here, '../sites-secrets.json'), 'utf8'))
const register = JSON.parse(readFileSync(resolve(here, '../sites-register.json'), 'utf8'))
const siteById = new Map(Object.values(register).map((s) => [s.siteId, s]))

export function sessionCookieName(site) {
  return `a_session_${site.projectId}`
}

function baseClient(site) {
  return new Client().setEndpoint(site.endpoint).setProject(site.projectId)
}

/** Anonymer Client (Login-Route): keine Session, kein Key. */
export function createPublicClient(event) {
  const site = event.context.site
  return { client: baseClient(site), account: (c) => new Account(c) }
}

/** Session-Client: Autorisierung = Appwrite (Row Permissions, RBAC-Labels). */
export function createSessionClient(event) {
  const site = event.context.site
  const session = getCookie(event, sessionCookieName(site))
  if (!session) return null
  const client = baseClient(site).setSession(session)
  return { client, account: new Account(client) }
}

/**
 * Secret-Resolver: einziger Zugang zum Runtime-Key. Enumerierte Scopes,
 * jeder Zugriff wird auditiert (im Spike: Konsole).
 */
// 'auth-login' ist die wichtigste enumerierte System-Op: SSR-Session-
// Erstellung braucht den Admin-Key (nur dann liefert Appwrite session.secret
// zurück) — identisch zum createAdminClient-Muster im Core-Login.
const SYSTEM_SCOPES = new Set(['auth-login', 'login-audit', 'user-admin'])

export function getSystemClient(siteId, scope) {
  if (!SYSTEM_SCOPES.has(scope)) {
    throw new Error(`getSystemClient: Scope "${scope}" ist nicht enumeriert`)
  }
  const entry = secrets[siteId]
  const site = siteById.get(siteId)
  if (!entry || !site) throw new Error(`getSystemClient: unbekannte Site "${siteId}"`)
  console.log(`[audit] system-client site=${siteId} scope=${scope}`)
  const client = baseClient(site).setKey(entry.runtimeKey)
  return { client, users: new Users(client), account: new Account(client) }
}
