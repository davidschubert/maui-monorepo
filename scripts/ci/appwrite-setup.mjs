/**
 * CI-Setup für eine FRISCHE Appwrite-Instanz (Idee 4): erledigt die sonst
 * interaktiven Console-Schritte per REST — Account (erster User, Whitelist
 * ROOT), Organisation, Projekt mit fester ID, API-Key mit allen Scopes,
 * Web-Platform — und schreibt die App-.env. Danach übernimmt das bestehende
 * `pnpm bootstrap --seed` (DB, Bucket, Migrationen, Demo-Daten).
 *
 *   node scripts/ci/appwrite-setup.mjs \
 *     --endpoint http://localhost:8080/v1 --app apps/reddit-comments
 *
 * Idempotent genug für Wiederholungsläufe gegen dieselbe Instanz (409 → weiter,
 * Login statt Signup); gedacht aber für Wegwerf-Instanzen (CI).
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const endpoint = (arg('endpoint', 'http://localhost:8080/v1')).replace(/\/$/, '')
const appDir = arg('app', 'apps/reddit-comments')
const projectId = arg('project', 'reddit-comments')
const EMAIL = 'ci@example.com'
const PASSWORD = 'ci-console-password-2026'

let cookie = ''

async function api(path, method = 'GET', body) {
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

function fail(step, status, json) {
  console.error(`✗ ${step} fehlgeschlagen (${status}): ${json?.message ?? ''}`)
  process.exit(1)
}

// 1) Console-Account (erster User — _APP_CONSOLE_WHITELIST_ROOT=enabled)
{
  const { status, json } = await api('/account', 'POST', {
    userId: 'ci-admin', email: EMAIL, password: PASSWORD, name: 'CI Admin',
  })
  if (status === 201) console.log('✔ Console-Account angelegt')
  else if (status === 409) console.log('↷ Console-Account existiert')
  else fail('Console-Account', status, json)
}

// 2) Console-Session (Cookie einsammeln)
{
  const { status, json, headers } = await api('/account/sessions/email', 'POST', {
    email: EMAIL, password: PASSWORD,
  })
  if (status !== 201) fail('Console-Login', status, json)
  const setCookies = headers.getSetCookie?.() ?? []
  cookie = setCookies.map(c => c.split(';')[0]).join('; ')
  if (!cookie) fail('Console-Login (kein Session-Cookie)', status, json)
  console.log('✔ Console-Session')
}

// 3) Organisation (Team im Console-Projekt)
{
  const { status, json } = await api('/teams', 'POST', { teamId: 'ci-org', name: 'CI' })
  if (status === 201) console.log('✔ Organisation angelegt')
  else if (status === 409) console.log('↷ Organisation existiert')
  else fail('Organisation', status, json)
}

// 4) Projekt mit fester ID
{
  const { status, json } = await api('/projects', 'POST', {
    projectId, name: projectId, teamId: 'ci-org', region: 'default',
  })
  if (status === 201) console.log(`✔ Projekt '${projectId}' angelegt`)
  else if (status === 409) console.log(`↷ Projekt '${projectId}' existiert`)
  else fail('Projekt', status, json)
}

// 5) API-Key mit allen Scopes — die Scope-Liste kommt von der Instanz selbst
//    (Console-Endpoint), damit sie zur Appwrite-Version passt.
let apiKey = ''
{
  // Appwrite kennt keinen "alle Scopes"-Shortcut; die vollständige Liste der
  // 1.9er-Scopes ist stabil dokumentiert:
  const scopes = [
    'sessions.write', 'users.read', 'users.write', 'teams.read', 'teams.write',
    'databases.read', 'databases.write', 'collections.read', 'collections.write',
    'attributes.read', 'attributes.write', 'indexes.read', 'indexes.write',
    'documents.read', 'documents.write', 'tables.read', 'tables.write',
    'columns.read', 'columns.write', 'rows.read', 'rows.write',
    'files.read', 'files.write', 'buckets.read', 'buckets.write',
    'functions.read', 'functions.write', 'execution.read', 'execution.write',
    'targets.read', 'targets.write', 'providers.read', 'providers.write',
    'messages.read', 'messages.write', 'topics.read', 'topics.write',
    'subscribers.read', 'subscribers.write', 'locale.read', 'avatars.read',
    'health.read', 'migrations.read', 'migrations.write', 'tokens.read',
    'tokens.write', 'sites.read', 'sites.write', 'log.read', 'log.write',
  ]
  const { status, json } = await api(`/projects/${projectId}/keys`, 'POST', {
    keyId: 'ci-key', name: 'ci-key', scopes,
  })
  if (status !== 201) fail('API-Key', status, json)
  apiKey = json.secret
  console.log(`✔ API-Key angelegt (${scopes.length} Scopes)`)
}

// 6) Web-Platform (localhost) — Realtime/Web-SDK-Origin
{
  const { status, json } = await api(`/projects/${projectId}/platforms`, 'POST', {
    platformId: 'ci-web', type: 'web', name: 'ci-web', hostname: 'localhost',
  })
  if (status === 201) console.log('✔ Web-Platform localhost')
  else if (status === 409) console.log('↷ Web-Platform existiert')
  else fail('Web-Platform', status, json)
}

// 7) App-.env schreiben (Format wie .env.example; SMTP bewusst leer)
{
  const envPath = resolve(appDir, '.env')
  const lines = [
    '# Von scripts/ci/appwrite-setup.mjs generiert (CI-Wegwerf-Instanz)',
    `NUXT_APPWRITE_KEY=${apiKey}`,
    `NUXT_APPWRITE_MIGRATIONS_KEY=${apiKey}`,
    `NUXT_PUBLIC_APPWRITE_ENDPOINT=${endpoint}`,
    `NUXT_PUBLIC_APPWRITE_PROJECT_ID=${projectId}`,
    `NUXT_PUBLIC_APPWRITE_DATABASE_ID=main`,
    `NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars`,
    `NUXT_PUBLIC_APPWRITE_GDPR_BUCKET=gdpr-exports`,
    `NUXT_PUBLIC_APP_URL=http://localhost:3001`,
    '',
  ]
  writeFileSync(envPath, lines.join('\n'))
  console.log(`✔ ${envPath} geschrieben`)
}

console.log('\nSetup fertig — weiter mit: pnpm --filter <app> bootstrap [--seed]')
