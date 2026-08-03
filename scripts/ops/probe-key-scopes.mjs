#!/usr/bin/env node
/**
 * Was DARF dieser Appwrite-Schlüssel eigentlich?
 *
 *   node scripts/ops/probe-key-scopes.mjs ~/.appwrite-secrets/migrations/control.env
 *   node scripts/ops/probe-key-scopes.mjs --key-file ~/.appwrite-secrets/control-runtime.key \
 *        --endpoint https://api.pukalani.app/v1 --project control
 *
 * WARUM ES DAS GIBT (F42, 2026-08-03): im Projekt `control` lag ein Schlüssel
 * mit 84 Scopes — praktisch Vollzugriff auf das Betreiber-Projekt. Die Frage
 * „wird der noch gebraucht?" war nicht zu beantworten, weil niemand sagen
 * konnte, WELCHER der herumliegenden Schlüssel welcher ist: die Console zeigt
 * Name und Scope-ZAHL, die `.env`-Dateien zeigen nur einen Wert. Erst die
 * Messung hat es entschieden — alle vier legitimen Schlüssel antworteten eng
 * (Laufzeit: users, keine Datenbanken; Migrationen: Datenbanken + Buckets,
 * keine Nutzer; der Platform-Leser: NUR rows.read), keiner war der große.
 *
 * WIE ES MISST: ausschließlich GET-Anfragen. Ein `401` heißt „Scope fehlt",
 * alles andere heißt „Scope da" — auch `400` (Anfrage falsch gebaut) und
 * `404` (Ressource gibt es nicht), denn beide setzen voraus, dass die
 * Autorisierung schon durch war. Genau daran erkennt man `users.read` auch
 * ohne gültige Query.
 *
 * DER SCHLÜSSEL WIRD NIE AUSGEGEBEN — weder ins Terminal noch in eine Datei.
 * Deshalb ist das Ergebnis auch nur eine GROBE Karte: es prüft Lese-Scopes je
 * Dienst, nicht die Schreib-Hälfte (dafür müsste es schreiben) und nicht die
 * feinen Unterschiede innerhalb eines Dienstes. Für die Frage „eng oder
 * allmächtig?" reicht das, für ein Scope-Audit auf Feld-Ebene nicht.
 */
import { readFileSync } from 'node:fs'

const PROBES = [
  { path: '/databases', label: 'databases.read', note: 'Migrationen' },
  { path: '/storage/buckets', label: 'buckets.read', note: 'Migrationen (Dateien)' },
  { path: '/users', label: 'users.read', note: 'Laufzeit' },
  { path: '/teams', label: 'teams.read', note: '—' },
  { path: '/functions', label: 'functions.read', note: '—' },
  { path: '/messaging/topics', label: 'topics.read', note: '—' },
  { path: '/health/version', label: 'health.read', note: '—' },
  { path: '/locale', label: 'locale.read', note: '—' },
  { path: '/avatars/browsers/chrome', label: 'avatars.read', note: '—' },
  { path: '/migrations', label: 'migrations.read', note: '—' },
]

function parseEnvFile(path) {
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || match[1].startsWith('#')) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }
    env[match[1]] = value
  }
  return env
}

const argv = process.argv.slice(2)
let envFile = null, keyFile = null, endpoint = null, project = null
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--key-file') keyFile = argv[++i]
  else if (argv[i] === '--endpoint') endpoint = argv[++i]
  else if (argv[i] === '--project') project = argv[++i]
  else envFile = argv[i]
}

let key = null
if (envFile) {
  const env = parseEnvFile(envFile.replace(/^~/, process.env.HOME ?? '~'))
  key = env.NUXT_APPWRITE_MIGRATIONS_KEY || env.NUXT_APPWRITE_KEY || env.NUXT_PLATFORM_CONTROL_KEY || null
  endpoint ??= env.NUXT_PUBLIC_APPWRITE_ENDPOINT || env.NUXT_PLATFORM_CONTROL_ENDPOINT || null
  project ??= env.NUXT_PUBLIC_APPWRITE_PROJECT_ID || env.NUXT_PLATFORM_CONTROL_PROJECT_ID || null
}
if (keyFile) key = readFileSync(keyFile.replace(/^~/, process.env.HOME ?? '~'), 'utf8').trim()

if (!key || !endpoint || !project) {
  console.error('✗ Brauche Schlüssel, Endpunkt und Projekt.\n'
    + '  node scripts/ops/probe-key-scopes.mjs <env-datei>\n'
    + '  node scripts/ops/probe-key-scopes.mjs --key-file <datei> --endpoint <url> --project <id>')
  process.exit(2)
}

console.log(`Projekt ${project} @ ${endpoint}\n`)
let granted = 0
for (const probe of PROBES) {
  let status
  try {
    const res = await fetch(`${endpoint}${probe.path}`, {
      headers: { 'X-Appwrite-Project': project, 'X-Appwrite-Key': key },
      signal: AbortSignal.timeout(15_000),
    })
    status = res.status
  }
  catch (error) {
    console.log(`  ?  ${probe.label.padEnd(18)} nicht erreichbar (${(error && error.message) || error})`)
    continue
  }
  // 401 = Scope fehlt. Alles andere setzt voraus, dass die Autorisierung durch war.
  const ok = status !== 401
  if (ok) granted++
  console.log(`  ${ok ? '✔' : '·'}  ${probe.label.padEnd(18)} ${String(status).padEnd(4)} ${ok ? probe.note : ''}`)
}

console.log(`\n${granted} von ${PROBES.length} geprüften Lese-Scopes vorhanden.`)
if (granted >= 6) {
  console.log('⚠ Das ist ein BREITER Schlüssel. Ein Zweck-Schlüssel deckt hier 1–2 Zeilen ab —\n'
    + '  Laufzeit: users · Migrationen: databases (+ buckets) · Cross-Projekt-Leser: gar keine davon.')
}
