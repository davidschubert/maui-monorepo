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
import { execFileSync } from 'node:child_process'
import { Client, TablesDB, ID } from 'node-appwrite'
// Geteilte Parsing-Logik (auch von der Appwrite Function / Track 2B genutzt).
import { parseCommitsToDraft } from '../../../functions/changelog-draft/src/parse.js'

// --- Argumente -------------------------------------------------------------
const args = process.argv.slice(2)
const flag = name => args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const dry = args.includes('--dry')
let since = flag('since')
const version = flag('version') ?? ''

// --- Commit-Range bestimmen ------------------------------------------------
// Ohne Shell (Arg-Array) — der user-gelieferte --since-Wert kann so nicht
// als Shell-Befehl interpretiert werden.
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}
if (!since) {
  try {
    since = git(['describe', '--tags', '--abbrev=0'])
    console.log(`ℹ Letzter Tag: ${since}`)
  }
  catch {
    console.warn('⚠ Kein Git-Tag gefunden — nehme die gesamte Historie. Mit --since=<sha> eingrenzen.')
  }
}
const range = since ? `${since}..HEAD` : 'HEAD'

// --- Commits lesen + parsen ------------------------------------------------
// Nur die Betreffzeilen — die geteilte Parsing-Logik macht den Rest.
const raw = git(['log', range, '--no-merges', '--pretty=format:%s'])
const subjects = raw ? raw.split('\n') : []

const { counted, body, category, title: titleHint, sectionCount } = parseCommitsToDraft(subjects, { version, range })

if (counted === 0) {
  console.log(`\nKeine relevanten Commits in ${range}. Nichts zu tun.`)
  process.exit(0)
}

console.log(`\n${'─'.repeat(60)}\n${titleHint}  [${category}]\n${'─'.repeat(60)}\n${body}\n${'─'.repeat(60)}`)
console.log(`\n${counted} Commit(s) in ${sectionCount} Kategorie(n).`)

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
