/**
 * changelog-draft — Produkt-„Was ist neu" aus Git-Commits vorbereiten (Track 2A).
 *
 * Liest die Conventional Commits seit dem letzten Release-Tag, mappt feat/fix/
 * perf/refactor auf Changelog-Kategorien und legt EINEN Entwurf (published:false)
 * mit gruppierter Stichpunktliste an. Den polierst du im Dashboard unter
 * Changelog zur fertigen Release-Note und veröffentlichst ihn.
 *
 * Läuft lokal (erreicht das self-hosted Appwrite — anders als GitHub CI):
 *   pnpm changelog:draft                      # seit letztem Tag, schreibt Entwurf
 *   pnpm changelog:draft -- --dry             # nur Vorschau, kein Schreiben
 *   pnpm changelog:draft -- --since=v1.4.0    # ab bestimmtem Tag/SHA
 *   pnpm changelog:draft -- --version=v1.5    # Version ins Entwurfs-Feld
 *
 * Benötigt die Runtime-Key-Env (rows.*) via --env-file (siehe package.json).
 */
import { execSync } from 'node:child_process'
import { Client, TablesDB, ID } from 'node-appwrite'

// --- Argumente -------------------------------------------------------------
const args = process.argv.slice(2)
const flag = name => args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const dry = args.includes('--dry')
let since = flag('since')
const version = flag('version') ?? ''

// --- Commit-Range bestimmen ------------------------------------------------
function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim()
}
if (!since) {
  try {
    since = git('describe --tags --abbrev=0')
    console.log(`ℹ Letzter Tag: ${since}`)
  }
  catch {
    console.warn('⚠ Kein Git-Tag gefunden — nehme die gesamte Historie. Mit --since=<sha> eingrenzen.')
  }
}
const range = since ? `${since}..HEAD` : 'HEAD'

// --- Commits lesen + parsen ------------------------------------------------
// Trennzeichen \x1f (unit separator) zwischen Subject und Datum.
const raw = git(`log ${range} --no-merges --pretty=format:%s%x1f%cI`)
const lines = raw ? raw.split('\n') : []

// Conventional-Commit-Typ → Changelog-Kategorie + Abschnittsüberschrift.
const MAP = {
  feat: { category: 'feature', section: 'Neue Funktionen' },
  fix: { category: 'fix', section: 'Fehlerbehebungen' },
  perf: { category: 'improvement', section: 'Verbesserungen' },
  refactor: { category: 'improvement', section: 'Verbesserungen' },
}
const CC = /^(\w+)(?:\([^)]*\))?(!)?:\s*(.+)$/

const buckets = new Map() // section → [desc, ...]
let counted = 0
for (const line of lines) {
  const [subject = ''] = line.split('\x1f')
  const m = subject.match(CC)
  if (!m) continue
  const [, type, , descRaw] = m
  const mapped = MAP[type]
  if (!mapped) continue // chore/docs/test/ci/build/style → raus
  const desc = descRaw.charAt(0).toUpperCase() + descRaw.slice(1)
  if (!buckets.has(mapped.section)) buckets.set(mapped.section, [])
  buckets.get(mapped.section).push(desc)
  counted++
}

if (counted === 0) {
  console.log(`\nKeine relevanten Commits in ${range}. Nichts zu tun.`)
  process.exit(0)
}

// --- Entwurf zusammenbauen -------------------------------------------------
// Reihenfolge der Abschnitte stabil halten.
const ORDER = ['Neue Funktionen', 'Verbesserungen', 'Fehlerbehebungen']
const body = ORDER
  .filter(s => buckets.has(s))
  .map(s => `${s}:\n${buckets.get(s).map(d => `• ${d}`).join('\n')}`)
  .join('\n\n')

// Dominante Kategorie (meiste Einträge) als Vorauswahl.
const sectionToCat = { 'Neue Funktionen': 'feature', Verbesserungen: 'improvement', Fehlerbehebungen: 'fix' }
const dominant = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)[0][0]
const category = sectionToCat[dominant]

const titleHint = version ? `Entwurf ${version}` : `Entwurf ${range}`

console.log(`\n${'─'.repeat(60)}\n${titleHint}  [${category}]\n${'─'.repeat(60)}\n${body}\n${'─'.repeat(60)}`)
console.log(`\n${counted} Commit(s) in ${buckets.size} Kategorie(n).`)

if (dry) {
  console.log('\n--dry: kein Eintrag geschrieben.')
  process.exit(0)
}

// --- Entwurf in Appwrite anlegen (published:false) -------------------------
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('\nFehlende Env-Vars — Script über "pnpm changelog:draft" (mit --env-file) aufrufen.')
  process.exit(1)
}

const db = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const row = await db.createRow({
  databaseId,
  tableId: 'changelog',
  rowId: ID.unique(),
  data: {
    title: titleHint,
    body,
    category,
    version,
    published: false,
    date: new Date().toISOString(),
  },
})
console.log(`\n✔ Entwurf angelegt (${row.$id}). Im Dashboard unter „Changelog" ausarbeiten und veröffentlichen.`)
