#!/usr/bin/env node
/**
 * create-site (M4/P1): neue Studio-Site in EINEM Befehl statt 5–10
 * Handschritten — Scaffold aus apps/_template, Appwrite-Projekt + Keys +
 * Platform per Console-REST (Gate G1/S1), .env, Install, Bootstrap
 * (DB/Buckets + manifest-gefilterte Migrationen).
 *
 *   pnpm create-site <name> [--features comments,posts,…]
 *                           [--endpoint http://localhost/v1] [--port 30xx]
 *                           [--skip-appwrite]
 *
 * Console-Zugang (fürs Anlegen von Projekt/Keys — NICHT die App-Keys):
 *   APPWRITE_CONSOLE_EMAIL / APPWRITE_CONSOLE_PASSWORD als Env-Vars.
 *   Ohne beide läuft nur der Scaffold + eine manuelle Checkliste
 *   (--skip-appwrite implizit).
 *
 * Governance (F6): Projekt-ID = <name>-<shortid> (unveränderlich, Slug
 * bleibt getrennt); Key-IDs global eindeutig (runtime-<name>/…) — Learnings
 * aus Spike S0/S1.
 */
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FOUNDATION_ALWAYS = ['core', 'system']
// Muss der EXTENDS_ORDER in check-manifests.mjs entsprechen
const EXTENDS_ORDER = [
  'themes', 'admin', 'comments', 'posts', 'events', 'media', 'feedback',
  'billing', 'courses', 'tickets', 'activity', 'moderation',
]
const DEFAULT_FEATURES = ['themes', 'admin', 'comments', 'moderation']

// ── Args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const name = argv[0] && !argv[0].startsWith('--') ? argv[0] : null
const arg = (key, fallback) => {
  const i = argv.indexOf(`--${key}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const skipAppwrite = argv.includes('--skip-appwrite')
const endpoint = arg('endpoint', 'http://localhost/v1').replace(/\/$/, '')

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

if (!name) fail('Nutzung: pnpm create-site <name> [--features a,b,c] [--endpoint URL] [--port 30xx] [--skip-appwrite]')
if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(`Ungültiger Name „${name}" — erlaubt: kleinbuchstaben, ziffern, bindestriche`)
const appDir = join(ROOT, 'apps', name)
if (existsSync(appDir)) fail(`apps/${name} existiert bereits`)

// ── Features validieren (Manifeste + requires-Schluss) ─────────────────────
const features = (arg('features', DEFAULT_FEATURES.join(','))).split(',').map(f => f.trim()).filter(Boolean)
for (const f of features) {
  if (FOUNDATION_ALWAYS.includes(f)) fail(`„${f}" ist implizit immer dabei — nicht listen`)
  if (!existsSync(join(ROOT, 'packages', f, 'feature.manifest.ts'))) fail(`Feature „${f}" existiert nicht (packages/${f}/feature.manifest.ts fehlt)`)
}
for (const f of features) {
  const manifest = (await import(pathToFileURL(join(ROOT, 'packages', f, 'feature.manifest.ts')).href)).default
  for (const req of manifest.requires ?? []) {
    if (!features.includes(req)) fail(`Feature „${f}" braucht „${req}" — mit in --features aufnehmen`)
  }
}

// ── Port: nächster freier 30xx ──────────────────────────────────────────────
let port = Number(arg('port', 0))
if (!port) {
  let max = 3001
  for (const dir of readdirSync(join(ROOT, 'apps'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const cfg = join(ROOT, 'apps', dir.name, 'nuxt.config.ts')
    if (!existsSync(cfg)) continue
    const m = readFileSync(cfg, 'utf8').match(/port:\s*(\d{4})/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  port = max + 1
}

console.log(`\n▸ Neue Site: apps/${name} · Port ${port} · Features: ${features.join(', ')} (+ core, system)\n`)

// ── 1) Scaffold aus _template ───────────────────────────────────────────────
cpSync(join(ROOT, 'apps', '_template'), appDir, {
  recursive: true,
  filter: src => !/node_modules|\.nuxt|\.output|\.env$/.test(src),
})

// package.json: Name, Port, @maui-Dependencies = Feature-Wahl
{
  const p = join(appDir, 'package.json')
  const pkg = JSON.parse(readFileSync(p, 'utf8'))
  pkg.name = name
  pkg.scripts.dev = `nuxi dev --port ${port}`
  for (const dep of Object.keys(pkg.dependencies)) {
    if (dep.startsWith('@maui/')) delete pkg.dependencies[dep]
  }
  for (const f of [...features, ...FOUNDATION_ALWAYS].sort()) {
    pkg.dependencies[`@maui/${f}`] = 'workspace:*'
  }
  pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(p, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log('✔ package.json (Name, Port, @maui-Dependencies)')
}

// nuxt.config.ts: extends in kanonischer Reihenfolge + Port
{
  const p = join(appDir, 'nuxt.config.ts')
  const extendsList = [
    ...EXTENDS_ORDER.filter(l => features.includes(l)),
    ...FOUNDATION_ALWAYS,
  ].map(l => `'../../packages/${l}'`).join(', ')
  let src = readFileSync(p, 'utf8')
  src = src.replace(/extends: \[[^\]]+\]/, `extends: [${extendsList}]`)
  src = src.replace(/port: \d{4}/, `port: ${port}`)
  writeFileSync(p, src)
  console.log('✔ nuxt.config.ts (extends, Port)')
}

// site.manifest.ts: Single Source der Feature-Wahl
{
  const body = features.map(f => `    '${f}',`).join('\n')
  writeFileSync(join(appDir, 'site.manifest.ts'), `import type { SiteManifest } from '../../packages/core/shared/types/manifest'

/**
 * Feature-Wahl dieser Site (generiert von create-site) — Single Source of
 * Truth; \`pnpm check:manifests\` hält extends + package.json konsistent.
 * core + system sind implizit immer dabei; Reihenfolge hier egal (Menge).
 */
export default {
  siteId: '${name}',
  features: [
${body}
  ],
} satisfies SiteManifest
`)
  console.log('✔ site.manifest.ts')
}

// ── 2) Appwrite: Projekt + Keys + Platform (Console-REST, Gate S1) ─────────
const consoleEmail = process.env.APPWRITE_CONSOLE_EMAIL
const consolePassword = process.env.APPWRITE_CONSOLE_PASSWORD
let projectId = ''
let runtimeKey = ''
let migrationsKey = ''

if (!skipAppwrite && consoleEmail && consolePassword) {
  let cookie = ''
  const consoleApi = async (path, method = 'GET', body) => {
    const res = await fetch(`${endpoint}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': 'console', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    return { status: res.status, json, headers: res.headers }
  }

  // Login als Console-Admin (Davids lokaler Console-Account)
  {
    const { status, json, headers } = await consoleApi('/account/sessions/email', 'POST', { email: consoleEmail, password: consolePassword })
    if (status !== 201) fail(`Console-Login fehlgeschlagen (${status}): ${json?.message ?? ''}`)
    cookie = (headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
    console.log('✔ Console-Session')
  }

  // Organisation: eigene Teams bevorzugen — eine FREMDE maui-sites-Org
  // (anderer Console-User) macht Projekt-Anlagen 401; dann eindeutige
  // Ausweich-Org unter eigener Mitgliedschaft anlegen.
  let teamId = 'maui-sites'
  {
    const own = await consoleApi('/teams')
    const existing = (own.json?.teams ?? []).find(t => String(t.$id).startsWith('maui-sites'))
    if (existing) {
      teamId = existing.$id
      console.log(`↷ Organisation ${teamId} (eigene) wird genutzt`)
    }
    else {
      let { status, json } = await consoleApi('/teams', 'POST', { teamId, name: 'Maui Sites' })
      if (status === 409) {
        teamId = `maui-sites-${Math.random().toString(36).slice(2, 6)}`
        ;({ status, json } = await consoleApi('/teams', 'POST', { teamId, name: 'Maui Sites' }))
      }
      if (status !== 201) fail(`Organisation (${status}): ${json?.message ?? ''}`)
      console.log(`✔ Organisation ${teamId} angelegt`)
    }
  }

  // Projekt-ID = <name>-<shortid> (F6: unveränderlich, lesbar, kollisionsfrei)
  {
    const shortid = Math.random().toString(36).slice(2, 6)
    projectId = `${name}-${shortid}`
    const { status, json } = await consoleApi('/projects', 'POST', { projectId, name, teamId, region: 'default' })
    if (status === 201) {
      console.log(`✔ Projekt ${projectId} angelegt`)
    }
    else if (status === 408 || status >= 500) {
      // Projekt-Anlage ist serverseitig teuer (komplettes Projekt-Schema) —
      // ein Timeout heißt oft „läuft noch". Pollen statt blind abbrechen
      // (Provisioner-Robustheit, Strategie P2).
      console.log(`… Projekt-Anlage antwortete ${status} — polle, ob es serverseitig fertig wird`)
      let found = false
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const probe = await consoleApi(`/projects/${projectId}`)
        if (probe.status === 200) { found = true; break }
      }
      if (!found) fail(`Projekt (${status}): ${json?.message ?? ''} — auch nach 60s nicht auffindbar. Scaffold liegt unter apps/${name}; vor dem Retry: rm -rf apps/${name}`)
      console.log(`✔ Projekt ${projectId} angelegt (nach Timeout-Poll)`)
    }
    else {
      fail(`Projekt (${status}): ${json?.message ?? ''} — Scaffold liegt unter apps/${name}; vor dem Retry: rm -rf apps/${name}`)
    }
  }

  // Zwei Keys (Konzept A2) — Key-IDs GLOBAL eindeutig (S1-Learning aus S0)
  const SCOPES = [
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
  for (const kind of ['runtime', 'migrations']) {
    const { status, json } = await consoleApi(`/projects/${projectId}/keys`, 'POST', {
      keyId: `${kind}-${name}`, name: `${projectId}-${kind}`, scopes: SCOPES,
    })
    if (status !== 201) fail(`Key ${kind} (${status}): ${json?.message ?? ''}`)
    if (kind === 'runtime') runtimeKey = json.secret
    else migrationsKey = json.secret
    console.log(`✔ Key ${kind}-${name}`)
  }

  // Web-Platform localhost (platformId ist pro Projekt eindeutig — S0-verifiziert)
  {
    const { status, json } = await consoleApi(`/projects/${projectId}/platforms`, 'POST', {
      platformId: 'web', type: 'web', name: 'Web', hostname: 'localhost',
    })
    if (status === 201) console.log('✔ Web-Platform localhost')
    else if (status === 409) console.log('↷ Web-Platform existiert')
    else fail(`Platform (${status}): ${json?.message ?? ''}`)
  }

  // .env schreiben
  writeFileSync(join(appDir, '.env'), `# Generiert von create-site — Keys NIE committen!
NUXT_APPWRITE_KEY=${runtimeKey}
NUXT_APPWRITE_MIGRATIONS_KEY=${migrationsKey}

NUXT_PUBLIC_APPWRITE_ENDPOINT=${endpoint}
NUXT_PUBLIC_APPWRITE_PROJECT_ID=${projectId}
NUXT_PUBLIC_APPWRITE_DATABASE_ID=main
NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars
NUXT_PUBLIC_APPWRITE_GDPR_BUCKET=gdpr-exports

NUXT_PUBLIC_APP_URL=http://localhost:${port}
`)
  console.log('✔ .env geschrieben')
}
else {
  console.log('↷ Appwrite-Provisionierung übersprungen (kein APPWRITE_CONSOLE_EMAIL/-PASSWORD bzw. --skip-appwrite)')
}

// .env.example an die Site anpassen (Doku-Zweck)
{
  const p = join(appDir, '.env.example')
  let src = readFileSync(p, 'utf8')
  src = src.replace(/NUXT_PUBLIC_APP_URL=.*/, `NUXT_PUBLIC_APP_URL=http://localhost:${port}`)
  if (projectId) src = src.replace(/NUXT_PUBLIC_APPWRITE_PROJECT_ID=.*/, `NUXT_PUBLIC_APPWRITE_PROJECT_ID=${projectId}`)
  writeFileSync(p, src)
}

// ── 3) Install + Bootstrap ──────────────────────────────────────────────────
console.log('\n— pnpm install (Workspace-Link) —')
{
  // --no-frozen-lockfile: eine NEUE App kann nie im Lockfile stehen —
  // in CI wäre frozen sonst der Default und bräche den G1-Lauf
  const result = spawnSync('pnpm', ['install', '--no-frozen-lockfile'], { stdio: 'inherit', cwd: ROOT })
  if (result.status !== 0) fail('pnpm install fehlgeschlagen')
}

if (runtimeKey) {
  console.log('\n— Bootstrap (DB, Buckets, Platform, Migrationen der gewählten Features) —')
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', `--env-file=${join(appDir, '.env')}`, join(appDir, 'scripts', 'bootstrap.ts')],
    { stdio: 'inherit', cwd: appDir },
  )
  if (result.status !== 0) fail('Bootstrap fehlgeschlagen')
}

// ── 4) Konsistenz + Checkliste ──────────────────────────────────────────────
{
  const result = spawnSync(process.execPath, ['--experimental-strip-types', join(ROOT, 'scripts', 'check-manifests.mjs')], { stdio: 'inherit', cwd: ROOT })
  if (result.status !== 0) fail('check:manifests rot — generierte Site inkonsistent (Bug in create-site melden)')
}

console.log(`
✔ Site apps/${name} ist bereit.

  Starten:   pnpm --filter ${name} dev        → http://localhost:${port}
  Features:  ${features.join(', ')} (+ core, system implizit)
${runtimeKey ? `  Appwrite:  Projekt ${projectId} auf ${endpoint}` : `
  ⚠ Appwrite fehlt noch (manuell):
    1. Console öffnen → Projekt anlegen (ID-Vorschlag: ${name}-xxxx)
    2. Zwei API-Keys (alle Scopes): runtime-${name} + migrations-${name}
    3. Web-Platform hostname localhost
    4. apps/${name}/.env aus .env.example füllen
    5. node --experimental-strip-types --env-file=apps/${name}/.env apps/${name}/scripts/bootstrap.ts`}

  Für PROD später (Phase 17): ploi-Site + DNS (A-Records app/api auf
  derselben Root-Domain) + Deploy-Webhook — Checkliste in
  docs/plans/PHASE-17-PRODUCTION.md.
`)
