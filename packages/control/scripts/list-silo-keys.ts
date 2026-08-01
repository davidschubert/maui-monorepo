/**
 * M4 — SCHLÜSSEL-VERZEICHNIS für Silo-Communities (Betreiber-Blick, read-only).
 *
 * ═══ WARUM ES DIESES SKRIPT GIBT ════════════════════════════════════════
 *
 * Der Wellen-Runner (`pnpm migrate --wave <welle> --control-env <env>`) ist
 * fail-loud: fehlt für ein Silo-Projekt die Migrations-Env-Datei
 * `~/.appwrite-secrets/migrations/<projectId>.env`, bricht er ab, BEVOR er
 * irgendetwas migriert (keine halbe Welle). Das ist richtig — aber man erfährt
 * es erst MITTEN im Rollout, in dem Moment, in dem man eigentlich migrieren
 * wollte. Was fehlte, war der VORAB-Blick: welche Silo-Projekte gibt es
 * überhaupt, in welcher Welle stehen sie, und liegt ihr Schlüssel hier?
 *
 * Genau das — und nichts mehr. Es ist ein VERZEICHNIS, keine Verwaltung:
 *
 * - Es LIEST das Community-Register des Control Plane (Quelle der Wahrheit für
 *   Welle/Modus/Projekt) und den LOKALEN Schlüssel-Ordner.
 * - Es SCHREIBT nichts — weder in die DB noch in den Ordner.
 * - Es DRUCKT NIE einen Schlüsselwert. Nur: Datei da / nicht da, Pflicht-
 *   Variable gesetzt / nicht gesetzt. Ein Verzeichnis, das Schlüssel ausgibt,
 *   wäre selbst das Leck, gegen das die Dateien unter `~/.appwrite-secrets/`
 *   angelegt wurden.
 * - Es legt KEINE Tabelle an und speichert nichts in Appwrite. Schlüssel
 *   gehören in Dateien auf der Betreiber-Maschine, nie in eine Datenbank.
 *
 * NICHT gebaut (bewusst): der DYNAMISCHE Silo-Admin-Zugriff zur LAUFZEIT
 * (fremdes Projekt → fremder Key) bleibt bei seinem 501 in
 * `core/server/lib/appwrite.ts`. Das ist eine andere Aufgabe — ein Server, der
 * fremde Admin-Keys hält, ist eine Sicherheitsentscheidung, kein Verzeichnis;
 * und heute bedient kein Silo-Host die Platform-App.
 *
 * ═══ AUFRUF ═════════════════════════════════════════════════════════════
 *
 * Aus dem Repo-Wurzelverzeichnis, gegen die CONTROL-PLANE-Instanz (dort liegt
 * `communities`) — lokal also mit `apps/control/.env`, für Prod mit der
 * Prod-Env des control-Deployments:
 *
 *   node --experimental-strip-types --env-file=apps/control/.env \
 *     packages/control/scripts/list-silo-keys.ts [--wave <welle>] [--keys-dir <ordner>]
 *
 * `--keys-dir` überschreibt den Ordner (Default `~/.appwrite-secrets/migrations`)
 * — dieselbe Option, die auch der Runner kennt; wer sie dort setzt, muss sie
 * hier setzen, sonst prüft das Verzeichnis einen anderen Ordner als den, aus
 * dem migriert wird.
 *
 * EXIT-CODE: 0 = jedes Silo-Projekt der Auswahl ist migrierbar · 1 = mindestens
 * eines nicht (Datei fehlt, Pflicht-Variable fehlt, oder die Datei gehört zu
 * einem anderen Projekt). Damit taugt der Aufruf auch als Vorabprüfung vor dem
 * Wellen-Lauf. Ein leeres Register ist KEIN Fehler (Exit 0): heute gibt es
 * keine fremden Silo-Kunden, und „nichts zu tun" ist eine gültige Antwort.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client, Query, TablesDB } from 'node-appwrite'
// Explizite .ts-Endungen: das Script läuft direkt unter Node
// --experimental-strip-types, das relative Imports nicht auflöst.
import { COMMUNITIES_TABLE, TENANT_WAVES, type TenantRow, type TenantWave } from '../shared/types/tenantRecord.ts'
import { siloProjectsForWave } from '../shared/waves.ts'

/** Was eine Migrations-Env-Datei mindestens tragen muss, damit der Runner mit
 *  ihr arbeiten kann (identisch zu dem, was jede Migration selbst liest). Der
 *  Key darf laut Migrations-Skripten auf NUXT_APPWRITE_KEY zurückfallen —
 *  deshalb steht er nicht in dieser Liste, sondern wird eigens geprüft. */
const REQUIRED_VARS = [
  'NUXT_PUBLIC_APPWRITE_ENDPOINT',
  'NUXT_PUBLIC_APPWRITE_PROJECT_ID',
  'NUXT_PUBLIC_APPWRITE_DATABASE_ID',
] as const

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? '' : (process.argv[i + 1] ?? '')
}

/**
 * Env-Datei in ein Verzeichnis „Variable → gesetzt?" übersetzen. Bewusst
 * SCHLICHT (KEY=VALUE je Zeile, `#`-Kommentare, optionales `export`) — es
 * geht nur um Anwesenheit, nicht um korrektes Env-Parsing; das macht Node
 * beim eigentlichen Lauf mit --env-file selbst. Die WERTE bleiben in dieser
 * Funktion: nach draußen geht nur, WELCHE Namen gesetzt sind, plus die
 * projectId (kein Geheimnis, aber die Antwort auf „ist das die richtige Datei?").
 */
function inspectEnvFile(file: string): { present: Set<string>, projectId: string } {
  const present = new Set<string>()
  let projectId = ''
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim().replace(/^export\s+/, '')
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const name = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (value === '') continue
    present.add(name)
    if (name === 'NUXT_PUBLIC_APPWRITE_PROJECT_ID') projectId = value
  }
  return { present, projectId }
}

/** Ein Silo-Projekt + der Befund zu seiner Schlüsseldatei. */
function inspectProject(projectId: string, keysDir: string) {
  const file = join(keysDir, `${projectId}.env`)
  if (!existsSync(file)) return { file, ok: false, problems: ['Datei fehlt'] }

  const { present, projectId: fileProject } = inspectEnvFile(file)
  const problems: string[] = []
  const missing = REQUIRED_VARS.filter(name => !present.has(name))
  if (missing.length > 0) problems.push(`fehlende Pflicht-Variablen: ${missing.join(', ')}`)
  if (!present.has('NUXT_APPWRITE_MIGRATIONS_KEY') && !present.has('NUXT_APPWRITE_KEY')) {
    problems.push('kein Migrations-Key (NUXT_APPWRITE_MIGRATIONS_KEY)')
  }
  // Eine Datei, die zu einem ANDEREN Projekt gehört, käme durch die
  // Existenzprüfung des Runners und würde die FALSCHE Instanz migrieren —
  // der Dateiname allein ist keine Zusage. Die projectId ist kein Geheimnis.
  if (fileProject && fileProject !== projectId) {
    problems.push(`Datei zeigt auf Projekt '${fileProject}'`)
  }
  const warnings = present.has('NUXT_APPWRITE_MIGRATIONS_KEY') || problems.length > 0
    ? []
    : ['nur NUXT_APPWRITE_KEY — der Runtime-Key hat keine tables/columns/indexes-Scopes']
  return { file, ok: problems.length === 0, problems, warnings }
}

const waveFilter = arg('wave').trim()
if (waveFilter && !(TENANT_WAVES as readonly string[]).includes(waveFilter)) {
  console.error(`✗ Unbekannte Welle '${waveFilter}' — erwartet: ${TENANT_WAVES.join(' | ')}`)
  process.exit(1)
}

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Control-Plane-Env unvollständig (NUXT_PUBLIC_APPWRITE_* + Key) — mit --env-file=<control-.env> aufrufen.')
  process.exit(1)
}

const keysDirArg = arg('keys-dir').trim()
const keysDir = keysDirArg
  ? resolve(process.cwd(), keysDirArg)
  : join(homedir(), '.appwrite-secrets', 'migrations')

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
// Gleiches Lesefenster + lauter Überlauf wie in list-silo-tenants.ts: eine
// übersehene Silo-Community wäre hier ein übersehener fehlender Schlüssel.
const { rows, total } = await tablesDB.listRows<TenantRow>({
  databaseId, tableId: COMMUNITIES_TABLE, queries: [Query.limit(500)],
})
if (total > rows.length) {
  console.error(`✗ ${COMMUNITIES_TABLE}-Table größer als das Lesefenster (${rows.length}/${total}) — Pagination hier UND in list-silo-tenants.ts nachrüsten.`)
  process.exit(1)
}

console.log(`Control Plane : ${endpoint} · Projekt ${projectId} · DB ${databaseId}`)
console.log(`Schlüssel-Ordner: ${keysDir}${existsSync(keysDir) ? '' : '  (existiert nicht)'}`)

const waves: TenantWave[] = waveFilter
  ? [waveFilter as TenantWave]
  : [...TENANT_WAVES]

let projectCount = 0
let readyCount = 0
const blocked: string[] = []

for (const wave of waves) {
  // Die Wellen-Zuordnung kommt aus DERSELBEN puren Regel, die der Runner
  // benutzt (siloProjectsForWave: '' = stable, disabled zählt mit, dedupliziert)
  // — ein Verzeichnis, das anders gruppiert als der Lauf, wäre wertlos.
  const projects = siloProjectsForWave(rows, wave)
  if (projects.length === 0) {
    console.log(`\nWelle '${wave}' — keine Silo-Communities`)
    continue
  }
  console.log(`\nWelle '${wave}' — ${projects.length} Silo-Projekt(e)`)
  for (const project of projects) {
    projectCount++
    const hosts = rows
      .filter(row => row.mode === 'silo' && row.projectId === project)
      .map(row => `${row.host}${row.status === 'disabled' ? ' (abgeschaltet)' : ''}`)
    const { file, ok, problems, warnings = [] } = inspectProject(project, keysDir)
    if (ok) readyCount++
    else blocked.push(project)
    console.log(`  ${ok ? '✔' : '✗'} ${project}  —  ${hosts.join(', ')}`)
    console.log(`      ${project}.env: ${ok ? 'bereit' : problems.join(' · ')}`)
    for (const warning of warnings) console.log(`      ⚠ ${warning}`)
    if (!ok && !existsSync(file)) console.log(`      erwartet: ${file}`)
  }
}

if (projectCount === 0) {
  console.log('\n✔ Keine Silo-Communities im Register — es gibt nichts zu hinterlegen.')
  process.exit(0)
}

console.log(`\nZusammenfassung: ${projectCount} Silo-Projekt(e) · ${readyCount} migrierbar · ${projectCount - readyCount} ohne brauchbare Schlüsseldatei`)
if (blocked.length > 0) {
  console.error(`✗ Der Wellen-Lauf würde abbrechen für: ${blocked.join(', ')}`)
  console.error(`  Format je Datei (${keysDir}/<projectId>.env): NUXT_PUBLIC_APPWRITE_ENDPOINT/_PROJECT_ID/_DATABASE_ID + NUXT_APPWRITE_MIGRATIONS_KEY.`)
  process.exit(1)
}
console.log('✔ Jedes Silo-Projekt hat seine Migrations-Env — der Wellen-Lauf kann starten.')
