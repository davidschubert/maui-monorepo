#!/usr/bin/env node
/**
 * Hat jede Instanz dieselben `system`-Spalten?
 *
 *   node scripts/ops/verify-schema-parity.mjs
 *
 * WARUM ES DAS GIBT (E5): der `system`-Layer läuft auf JEDER Instanz mit —
 * Pool, Control Plane und jede Einzel-Instanz. Eine neue `system`-Migration
 * muss deshalb überall gefahren werden, und bisher stand dafür nur eine Notiz
 * in der offenen-Punkte-Liste: „mitdenken". Genau das hält nicht.
 *
 * Es gibt KEIN Migrations-Register in der Datenbank (die Idempotenz kommt vom
 * 409), also lässt sich nicht fragen „welche Migration lief hier?". Was man
 * fragen kann, ist das ERGEBNIS: welche Spalten existieren. Fehlt einer
 * Instanz eine Spalte, die alle anderen haben, ist dort eine Migration
 * ausgeblieben — und das sieht man sonst erst, wenn eine Route 500 wirft.
 *
 * Der Vergleich läuft gegen die VEREINIGUNG aller Instanzen, nicht gegen eine
 * Referenz-Instanz. Sonst müsste man eine küren, und wenn ausgerechnet die
 * zurückhängt, ist der Wächter still zufrieden.
 *
 * Schlüssel werden nie ausgegeben; gelesen werden nur Schema-Metadaten.
 * Exit 0 = deckungsgleich · Exit 1 = irgendwo fehlt etwas.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Tabellen, die dem `system`-Layer gehören (A14). BEWUSST eine gepflegte
 * Liste statt aus den Migrations-Dateien abgeleitet: die Dateien legen auch
 * Tabellen an, die später wieder verschwinden, und ein Wächter, der Altlasten
 * anmahnt, wird weggelesen. Neue system-Tabelle ⇒ hier eintragen.
 */
const SYSTEM_TABLES = [
  'activities',
  'app_config',
  'app_secrets',
  'audit_logs',
  'community_branding',
  'custom_fonts',
  'custom_themes',
  'notifications',
]

/**
 * Jede Instanz mit ihrer Env-Datei. Fehlt eine Datei, wird sie ÜBERSPRUNGEN
 * und gemeldet — `photos` existiert als App im Repo, ist aber nicht
 * ausgerollt (kein pm2-Prozess, keine ploi-Site, keine `.env.production`),
 * und ein Wächter darf daran nicht scheitern.
 */
const INSTANCES = [
  { name: 'pool', env: join(homedir(), '.appwrite-secrets/migrations/pool.env') },
  { name: 'control', env: join(homedir(), '.appwrite-secrets/migrations/control.env') },
  { name: 'comments', env: 'apps/comments/.env.production' },
  { name: 'portfolio', env: 'apps/portfolio/.env.production' },
  { name: 'photos', env: 'apps/photos/.env.production' },
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

async function columnsOf(cfg, table) {
  const url = `${cfg.endpoint}/tablesdb/${cfg.databaseId}/tables/${table}/columns`
    + `?queries%5B%5D=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [500] }))}`
  const res = await fetch(url, {
    headers: { 'X-Appwrite-Project': cfg.project, 'X-Appwrite-Key': cfg.key },
    signal: AbortSignal.timeout(25_000),
  })
  if (res.status === 404) return null // Tabelle fehlt ganz
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`)
  const body = await res.json()
  return new Set((body.columns ?? []).map(c => c.key))
}

const found = []
for (const instance of INSTANCES) {
  if (!existsSync(instance.env)) {
    console.log(`·  ${instance.name.padEnd(10)} übersprungen — ${instance.env} gibt es nicht (nicht ausgerollt?)`)
    continue
  }
  const env = parseEnvFile(instance.env)
  const cfg = {
    endpoint: env.NUXT_PUBLIC_APPWRITE_ENDPOINT,
    project: env.NUXT_PUBLIC_APPWRITE_PROJECT_ID,
    databaseId: env.NUXT_PUBLIC_APPWRITE_DATABASE_ID,
    key: env.NUXT_APPWRITE_MIGRATIONS_KEY || env.NUXT_APPWRITE_KEY,
  }
  if (!cfg.endpoint || !cfg.project || !cfg.key || !cfg.databaseId) {
    console.log(`✖  ${instance.name.padEnd(10)} Env unvollständig — übersprungen`)
    continue
  }
  const schema = {}
  for (const table of SYSTEM_TABLES) schema[table] = await columnsOf(cfg, table)
  found.push({ name: instance.name, schema })
}

if (found.length < 2) {
  console.error('\n✗ Weniger als zwei Instanzen lesbar — ohne Vergleich ist die Aussage wertlos.')
  process.exit(2)
}

// Vereinigung über ALLE Instanzen: so fällt auch auf, wenn die Referenz hinkt.
const union = {}
for (const table of SYSTEM_TABLES) {
  union[table] = new Set()
  for (const inst of found) for (const col of inst.schema[table] ?? []) union[table].add(col)
}

let broken = 0
for (const inst of found) {
  const problems = []
  for (const table of SYSTEM_TABLES) {
    const cols = inst.schema[table]
    if (cols === null) { problems.push(`${table}: TABELLE FEHLT`); continue }
    const missing = [...union[table]].filter(c => !cols.has(c)).sort()
    if (missing.length) problems.push(`${table}: ${missing.join(', ')}`)
  }
  if (problems.length === 0) {
    console.log(`✔  ${inst.name.padEnd(10)} deckungsgleich (${SYSTEM_TABLES.length} system-Tabellen)`)
    continue
  }
  broken++
  console.log(`✖  ${inst.name.padEnd(10)} es fehlt:`)
  for (const line of problems) console.log(`   ${' '.repeat(10)} ${line}`)
}

if (broken > 0) {
  console.log(`\n${broken} Instanz(en) hängen zurück. Nachfahren mit:  pnpm migrate --app <app> --layer system`)
  process.exit(1)
}
console.log('\nAlle Instanzen tragen dasselbe system-Schema.')
