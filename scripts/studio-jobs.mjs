#!/usr/bin/env node
/**
 * studio-jobs (M6-T2): führt Provisionierungs-Jobs aus dem Studio-Control-
 * Plane aus — „create-site als Job hinter der UI", Vorstufe des
 * Provisioner-Workers (M7, Strategie § 8). Der Runner ist der REPO-seitige
 * Akteur: Er hält Console-Credentials, synct den Feature-Katalog aus den
 * feature.manifest.ts der Layer in die Studio-DB und arbeitet die
 * `provisioning_jobs`-Queue ab (queued → running → done/error).
 *
 *   APPWRITE_CONSOLE_EMAIL=… APPWRITE_CONSOLE_PASSWORD=… pnpm studio:jobs [--watch]
 *
 * Ohne --watch: ein Durchlauf (Katalog-Sync + Queue leeren), dann Exit.
 * Mit --watch: pollt alle 5 s weiter (Dev-Betrieb neben der Studio-UI).
 * Verbindung zur Studio-DB kommt aus apps/studio/.env (Runtime-Key reicht —
 * Jobs/Katalog/Sites sind Rows).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { hostname } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')
const RUNNER_ID = `${hostname()}#${process.pid}`
const LOG_LIMIT = 7500 // Spalte log: 8000 (studio-002) — Tail gewinnt

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

// ── Studio-Verbindung aus apps/studio/.env ──────────────────────────────────
const envPath = join(ROOT, 'apps', 'studio', '.env')
if (!existsSync(envPath)) fail('apps/studio/.env fehlt — Studio erst provisionieren')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(line => line.includes('=') && !line.trimStart().startsWith('#'))
    .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
)
const endpoint = (env.NUXT_PUBLIC_APPWRITE_ENDPOINT ?? '').replace(/\/$/, '')
const projectId = env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) fail('apps/studio/.env unvollständig (Endpoint/Projekt/DB/Key)')

async function api(path, method = 'GET', body) {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

const rowsPath = table => `/tablesdb/${databaseId}/tables/${table}/rows`
const query = q => `queries[]=${encodeURIComponent(JSON.stringify(q))}`

// ── Feature-Katalog: Repo-Manifeste → feature_catalog (rowId = key) ────────
async function syncCatalog() {
  const keys = []
  for (const dir of readdirSync(join(ROOT, 'packages'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const manifestPath = join(ROOT, 'packages', dir.name, 'feature.manifest.ts')
    if (!existsSync(manifestPath)) continue
    const manifest = (await import(pathToFileURL(manifestPath).href)).default
    keys.push(manifest.key)
    const data = {
      tier: manifest.tier,
      requires: JSON.stringify(manifest.requires ?? []),
      hasMigrations: manifest.hasMigrations,
      title: JSON.stringify(manifest.title),
      description: JSON.stringify(manifest.description),
      icon: manifest.icon ?? '',
      syncedAt: new Date().toISOString(),
    }
    const update = await api(`${rowsPath('feature_catalog')}/${manifest.key}`, 'PATCH', { data })
    if (update.status === 404) {
      const create = await api(rowsPath('feature_catalog'), 'POST', { rowId: manifest.key, data })
      if (create.status !== 201) fail(`Katalog-Sync ${manifest.key} (${create.status}): ${create.json?.message ?? ''}`)
    }
    else if (update.status !== 200) {
      fail(`Katalog-Sync ${manifest.key} (${update.status}): ${update.json?.message ?? ''}`)
    }
  }
  console.log(`✔ Feature-Katalog gesynct (${keys.length}): ${keys.sort().join(', ')}`)
}

// ── Job-Ausführung ──────────────────────────────────────────────────────────
async function updateJob(id, data) {
  const { status, json } = await api(`${rowsPath('provisioning_jobs')}/${id}`, 'PATCH', { data })
  if (status !== 200) console.error(`⚠ Job-Update ${id} (${status}): ${json?.message ?? ''}`)
}

async function runSiteCreate(job, payload) {
  const { name, features, port } = payload
  const args = ['--experimental-strip-types', join(ROOT, 'scripts', 'create-site.mjs'), name, '--features', features.join(',')]
  if (port) args.push('--port', String(port))

  console.log(`▸ Job ${job.$id}: create-site ${name} (Features: ${features.join(', ') || '—'})`)
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const log = output.length > LOG_LIMIT ? `… (gekürzt)\n${output.slice(-LOG_LIMIT)}` : output

  if (result.status !== 0) {
    await updateJob(job.$id, { status: 'error', log, finishedAt: new Date().toISOString() })
    console.error(`✗ Job ${job.$id} fehlgeschlagen (Exit ${result.status})`)
    return
  }

  // Ergebnis aus dem Scaffold lesen (create-site vergibt Projekt-ID + Port)
  const siteEnvPath = join(ROOT, 'apps', name, '.env')
  const siteEnv = existsSync(siteEnvPath) ? readFileSync(siteEnvPath, 'utf8') : ''
  const siteProjectId = siteEnv.match(/NUXT_PUBLIC_APPWRITE_PROJECT_ID=(.+)/)?.[1]?.trim() ?? ''
  const sitePkg = JSON.parse(readFileSync(join(ROOT, 'apps', name, 'package.json'), 'utf8'))
  const sitePort = Number(sitePkg.scripts?.dev?.match(/--port (\d+)/)?.[1] ?? 0)
  const appUrl = sitePort ? `http://localhost:${sitePort}` : ''

  // Site im Register eintragen (gleicher Vertrag wie POST /api/studio/sites)
  let siteRowId = ''
  if (siteProjectId) {
    const { status, json } = await api(rowsPath('sites'), 'POST', {
      rowId: 'unique()',
      data: {
        name, slug: name, projectId: siteProjectId, endpoint, appUrl,
        status: 'active', healthStatus: 'unknown', healthCheckedAt: null,
        notes: `create-site via Job ${job.$id}`,
      },
    })
    if (status === 201) siteRowId = json.$id
    else console.error(`⚠ Register-Eintrag (${status}): ${json?.message ?? ''}`)

    // Auto-Grant (M6-T3): die gewählten Features sind der Site zugeteilt
    for (const featureKey of features) {
      const grant = await api(rowsPath('entitlements'), 'POST', {
        rowId: 'unique()',
        data: { siteProjectId, featureKey, status: 'active', notes: `create-site via Job ${job.$id}` },
      })
      if (grant.status !== 201 && grant.status !== 409) {
        console.error(`⚠ Entitlement ${featureKey} (${grant.status}): ${grant.json?.message ?? ''}`)
      }
    }
  }

  await updateJob(job.$id, {
    status: siteProjectId ? 'done' : 'error',
    log,
    result: JSON.stringify({ projectId: siteProjectId, port: sitePort, appUrl, siteRowId }),
    finishedAt: new Date().toISOString(),
  })
  console.log(siteProjectId
    ? `✔ Job ${job.$id} fertig — Projekt ${siteProjectId}, Port ${sitePort}`
    : `✗ Job ${job.$id}: Scaffold ohne Appwrite-Projekt (Console-Creds prüfen)`)
}

async function processQueue() {
  const { status, json } = await api(`${rowsPath('provisioning_jobs')}?${query({ method: 'equal', attribute: 'status', values: ['queued'] })}&${query({ method: 'orderAsc', attribute: '$createdAt' })}&${query({ method: 'limit', values: [10] })}`)
  if (status !== 200) fail(`Queue lesen (${status}): ${json?.message ?? ''}`)

  for (const job of json.rows ?? []) {
    const payload = JSON.parse(job.payload ?? '{}')
    if (job.type !== 'site.create') {
      await updateJob(job.$id, { status: 'error', log: `Unbekannter Job-Typ: ${job.type}`, finishedAt: new Date().toISOString() })
      continue
    }
    if (!process.env.APPWRITE_CONSOLE_EMAIL || !process.env.APPWRITE_CONSOLE_PASSWORD) {
      console.warn(`⚠ Job ${job.$id} bleibt queued — APPWRITE_CONSOLE_EMAIL/-PASSWORD fehlen`)
      continue
    }
    await updateJob(job.$id, { status: 'running', runnerId: RUNNER_ID, startedAt: new Date().toISOString() })
    await runSiteCreate(job, payload)
  }
  return (json.rows ?? []).length
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`studio-jobs · ${RUNNER_ID} · Studio-Projekt ${projectId} auf ${endpoint}${watch ? ' · watch (5 s)' : ''}`)
await syncCatalog()
if (watch) {
  // Endlosschleife bewusst sequenziell — ein Job nach dem anderen
  for (;;) {
    await processQueue().catch(error => console.error(`⚠ ${error.message}`))
    await new Promise(r => setTimeout(r, 5000))
  }
}
else {
  await processQueue()
}
