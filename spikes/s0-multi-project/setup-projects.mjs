/**
 * S0-Spike-Setup: legt auf der WEGWERF-Instanz (ci/appwrite, Port 8080)
 * per Console-REST zwei Projekte an — je Projekt: API-Key (Runtime-Scopes),
 * Web-Platform, ein Test-User — und schreibt zwei Dateien:
 *
 *   sites-register.json   → { hostname: { siteId, projectId, endpoint } }  (öffentlich)
 *   sites-secrets.json    → { siteId: { runtimeKey } }                     (gitignored)
 *
 * Muster übernommen aus scripts/ci/appwrite-setup.mjs (Whitelist-ROOT-Account,
 * 409 → weiter). NUR gegen die Wegwerf-Instanz laufen lassen.
 *
 *   node spikes/s0-multi-project/setup-projects.mjs [--endpoint http://localhost:8080/v1]
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const endpoint = arg('endpoint', 'http://localhost:8080/v1').replace(/\/$/, '')
const EMAIL = 's0@example.com'
const PASSWORD = 's0-console-password-2026'

const SITES = [
  { siteId: 'alpha', projectId: 's0-site-alpha', hostname: 'alpha.localhost', userEmail: 'anna@alpha.local' },
  { siteId: 'beta', projectId: 's0-site-beta', hostname: 'beta.localhost', userEmail: 'ben@beta.local' },
]
const USER_PASSWORD = 'S0-Demo-Passw0rd!'

let cookie = ''

async function consoleApi(path, method = 'GET', body) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': 'console',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json, headers: res.headers }
}

async function projectApi(projectId, key, path, method = 'GET', body) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': key,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

function fail(step, status, json) {
  console.error(`✗ ${step} fehlgeschlagen (${status}): ${json?.message ?? ''}`)
  process.exit(1)
}

// 1) Console-Account (erster User — _APP_CONSOLE_WHITELIST_ROOT=enabled)
{
  const { status, json } = await consoleApi('/account', 'POST', {
    userId: 's0-admin', email: EMAIL, password: PASSWORD, name: 'S0 Admin',
  })
  if (status === 201) console.log('✔ Console-Account angelegt')
  else if (status === 409) console.log('↷ Console-Account existiert')
  else fail('Console-Account', status, json)
}

// 2) Console-Session
{
  const { status, json, headers } = await consoleApi('/account/sessions/email', 'POST', {
    email: EMAIL, password: PASSWORD,
  })
  if (status !== 201) fail('Console-Login', status, json)
  const setCookies = headers.getSetCookie?.() ?? []
  cookie = setCookies.map((c) => c.split(';')[0]).join('; ')
  if (!cookie) fail('Console-Login (kein Cookie)', status, json)
  console.log('✔ Console-Session')
}

// 3) Organisation
let teamId = 's0-org'
{
  const { status, json } = await consoleApi('/teams', 'POST', {
    teamId, name: 'S0 Spike Org',
  })
  if (status === 201) console.log('✔ Organisation angelegt')
  else if (status === 409) console.log('↷ Organisation existiert')
  else fail('Organisation', status, json)
}

const register = {}
const secrets = {}

for (const site of SITES) {
  // 4) Projekt
  {
    const { status, json } = await consoleApi('/projects', 'POST', {
      projectId: site.projectId, name: `S0 ${site.siteId}`, teamId, region: 'default',
    })
    if (status === 201) console.log(`✔ Projekt ${site.projectId} angelegt`)
    else if (status === 409) console.log(`↷ Projekt ${site.projectId} existiert`)
    else fail(`Projekt ${site.projectId}`, status, json)
  }

  // 5) API-Key (Runtime-Scopes — bewusst NICHT alle: kein databases.write etc. nötig fürs Spike)
  let runtimeKey = ''
  {
    // keyId GLOBAL eindeutig wählen (S1-Learning: self-hosted Console
    // erlaubt dieselbe keyId nicht in zwei Projekten)
    const keyId = `runtime-${site.siteId}`
    const { status, json } = await consoleApi(`/projects/${site.projectId}/keys`, 'POST', {
      keyId,
      name: `${site.projectId}-runtime`,
      scopes: ['users.read', 'users.write', 'sessions.write'],
    })
    if (status === 201) {
      runtimeKey = json.secret
      console.log(`✔ Key ${site.projectId}-runtime angelegt`)
    } else if (status === 409) {
      const existing = await consoleApi(`/projects/${site.projectId}/keys/${keyId}`)
      if (existing.status === 200 && existing.json.secret) {
        runtimeKey = existing.json.secret
        console.log(`↷ Key ${site.projectId}-runtime existiert (Secret gelesen)`)
      } else fail(`Key ${site.projectId} (409-Reuse)`, existing.status, existing.json)
    } else fail(`Key ${site.projectId}`, status, json)
  }

  // 6) Web-Platform (Hostname der Site)
  {
    const { status, json } = await consoleApi(`/projects/${site.projectId}/platforms`, 'POST', {
      platformId: 'web', type: 'web', name: 'S0 Web', hostname: site.hostname,
    })
    if (status === 201) console.log(`✔ Platform ${site.hostname}`)
    else if (status === 409) console.log(`↷ Platform ${site.hostname} existiert`)
    else fail(`Platform ${site.hostname}`, status, json)
  }

  // 7) Test-User im Site-Projekt (per Projekt-Admin-Key — wie bootstrap --seed)
  {
    const { status, json } = await projectApi(site.projectId, runtimeKey, '/users', 'POST', {
      userId: `user-${site.siteId}`, email: site.userEmail, password: USER_PASSWORD, name: `User ${site.siteId}`,
    })
    if (status === 201) console.log(`✔ Test-User ${site.userEmail}`)
    else if (status === 409) console.log(`↷ Test-User ${site.userEmail} existiert`)
    else fail(`Test-User ${site.siteId}`, status, json)
  }

  register[site.hostname] = { siteId: site.siteId, projectId: site.projectId, endpoint }
  secrets[site.siteId] = { runtimeKey }
}

writeFileSync(resolve(here, 'sites-register.json'), JSON.stringify(register, null, 2))
writeFileSync(resolve(here, 'sites-secrets.json'), JSON.stringify(secrets, null, 2))
console.log('✔ sites-register.json + sites-secrets.json geschrieben')
console.log(`  Test-User-Passwort: ${USER_PASSWORD}`)
