/**
 * Bootstrap: bringt eine frische Appwrite-Instanz von 0 auf lauffähig — die
 * Schritte, die sonst manuell/per Odyssee laufen, in einem Befehl.
 *
 *   node --experimental-strip-types --env-file=apps/<app>/.env \
 *     apps/<app>/scripts/bootstrap.ts [--seed]
 *
 * VORAUSSETZUNG (manuell, weil interaktiv):
 *   1. Appwrite-Instanz läuft (Docker/OrbStack), Console erreichbar.
 *   2. In der Console: Account + Projekt + API-Key (alle Scopes) angelegt.
 *   3. apps/<app>/.env gesetzt: NUXT_PUBLIC_APPWRITE_{ENDPOINT,PROJECT_ID,
 *      DATABASE_ID,AVATARS_BUCKET} + NUXT_APPWRITE_KEY.
 *
 * DANN macht dieses Script automatisch:
 *   - Datenbank (DATABASE_ID) anlegen (idempotent)
 *   - Avatars-Bucket anlegen (idempotent, passende Permissions/Limits)
 *   - Web-Platform (localhost) anlegen (best-effort — braucht evtl. Console)
 *   - alle Layer-Migrationen in Reihenfolge (system→comments→moderation→admin)
 *   - optional (--seed): Demo-User + Kommentare
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, TablesDB, Query } from 'node-appwrite'

// App-Name aus dem Script-Pfad (apps/<app>/scripts/bootstrap.ts) — das Script
// ist damit als Kopiervorlage app-agnostisch (apps/_template). Verzeichnisname
// für den Migrations-Runner (--app), Package-Name für pnpm-Filter (kann
// abweichen, z. B. _template ↔ app-template).
const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP_NAME = basename(APP_DIR)
const APP_PKG = JSON.parse(readFileSync(resolve(APP_DIR, 'package.json'), 'utf8')) as { name: string, scripts?: Record<string, string> }

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID ?? 'main'
const bucketId = process.env.NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET ?? 'avatars'
const apiKey = process.env.NUXT_APPWRITE_KEY ?? process.env.NUXT_APPWRITE_MIGRATIONS_KEY
if (!endpoint || !projectId || !apiKey) {
  console.error(`✗ Fehlende Env-Vars — mit --env-file=apps/${APP_NAME}/.env aufrufen.`)
  process.exit(1)
}
const withSeed = process.argv.includes('--seed')
const force = process.argv.includes('--force')

async function api(path: string, method = 'GET', body?: unknown): Promise<{ status: number, json: Record<string, unknown> }> {
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: { 'X-Appwrite-Project': projectId!, 'X-Appwrite-Key': apiKey!, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({})) as Record<string, unknown>
  return { status: res.status, json }
}

function ok(status: number) { return status >= 200 && status < 300 }

console.log(`Bootstrap gegen ${endpoint} / Projekt ${projectId}\n`)

// 1) Datenbank
{
  const { status, json } = await api('/databases', 'POST', { databaseId, name: databaseId })
  if (ok(status)) console.log(`✔ Datenbank '${databaseId}' angelegt`)
  else if (status === 409) console.log(`↷ Datenbank '${databaseId}' existiert bereits`)
  else { console.error(`✗ Datenbank fehlgeschlagen (${status}): ${json.message}`); process.exit(1) }
}

// 2) Avatars-Bucket
{
  const { status, json } = await api('/storage/buckets', 'POST', {
    bucketId, name: 'avatars',
    permissions: ['create("users")', 'read("any")'],
    fileSecurity: true, enabled: true,
    maximumFileSize: 5 * 1024 * 1024,
    allowedFileExtensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
    compression: 'none', encryption: false, antivirus: false,
  })
  if (ok(status)) console.log(`✔ Bucket '${bucketId}' angelegt`)
  else if (status === 409) console.log(`↷ Bucket '${bucketId}' existiert bereits`)
  else console.warn(`⚠ Bucket fehlgeschlagen (${status}): ${json.message}`)
}

// 2b) GDPR-Exports-Bucket (Pre-Delete-Snapshots; nur Server-Key schreibt,
// Downloads laufen über Admin-Routen mit requirePermission)
{
  const gdprBucket = process.env.NUXT_PUBLIC_APPWRITE_GDPR_BUCKET ?? 'gdpr-exports'
  const { status, json } = await api('/storage/buckets', 'POST', {
    bucketId: gdprBucket, name: 'gdpr-exports',
    permissions: [], // keine Bucket-weiten Rechte — File-Permissions read(label:admin)
    fileSecurity: true, enabled: true,
    maximumFileSize: 25 * 1024 * 1024, // unter dem 30-MB-Default-Limit der Instanz
    allowedFileExtensions: ['json'],
    compression: 'none', encryption: true, antivirus: false,
  })
  if (ok(status)) console.log(`✔ Bucket '${gdprBucket}' angelegt`)
  else if (status === 409) console.log(`↷ Bucket '${gdprBucket}' existiert bereits`)
  else console.warn(`⚠ GDPR-Bucket fehlgeschlagen (${status}): ${json.message}`)
}

// 3) Web-Platform (best-effort — Projekt-Management-Scope; ggf. in der Console anlegen)
{
  const { status } = await api(`/projects/${projectId}/platforms`, 'POST', {
    type: 'web', name: 'localhost', hostname: 'localhost',
  })
  if (ok(status)) console.log('✔ Web-Platform localhost angelegt')
  else if (status === 409) console.log('↷ Web-Platform existiert bereits')
  else console.warn(`⚠ Web-Platform nicht per API anlegbar (${status}) — optional, ggf. in der Console: Overview → Add platform → Web → hostname localhost`)
}

// 4) Sicherheits-Guard: Migrationen sind für FRISCHE Instanzen. Einige (z. B.
// comments-002) bauen das Schema DESTRUKTIV um (drop + recreate) → auf einer
// befüllten Instanz droht Datenverlust. Deshalb Abbruch, wenn schon Daten da.
if (!force && (endpoint || projectId)) {
  const sdk = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
  try {
    const res = await sdk.listRows({ databaseId, tableId: 'comments', queries: [Query.limit(1)] })
    if (res.total > 0) {
      console.error(`\n✗ Instanz ist NICHT frisch: comments hat ${res.total} Zeilen. Migrationen wären destruktiv (Datenverlust). Abbruch. Mit --force erzwingen (Daten gehen verloren).`)
      process.exit(1)
    }
  }
  catch {
    // Tabelle existiert noch nicht → frische Instanz, alles gut
  }
}

// 5) Migrationen — zentraler Runner, explizit gegen DIESE App (nie die falsche
// Instanz; die Layer-Scripts selbst sind idempotent).
console.log('\n— Migrationen —')
execSync(`node ${resolve(APP_DIR, '../../scripts/migrate.mjs')} --app ${APP_NAME}`, { stdio: 'inherit' })

// 6) Optional: Seed — nur wenn die App ein seed-Script mitbringt (die
// Template-Kopie hat keins; Vorlage: apps/reddit-comments/scripts/seed-demo.ts)
if (withSeed) {
  if (APP_PKG.scripts?.seed) {
    console.log('\n— Demo-Seed —')
    execSync(`pnpm --filter ${APP_PKG.name} seed`, { stdio: 'inherit' })
  }
  else {
    console.warn(`⚠ --seed übersprungen: ${APP_NAME} hat kein seed-Script in der package.json`)
  }
}

console.log(`\n✔ Bootstrap fertig. App starten mit: pnpm --filter ${APP_PKG.name} dev`)
