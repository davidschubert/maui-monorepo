#!/usr/bin/env node
/**
 * WÄCHTER: ZEIGT DIE DOKU NOCH AUF ETWAS, DAS ES GIBT? (F22, 2026-08-02)
 *
 * Die Doku dieses Repos ist ihr eigenes Gedächtnis: sie nennt Dateien, Routen,
 * Migrationen und Skripte beim Namen, und genau davon lebt sie. Eine
 * Umbenennung zieht die MELDUNGEN mit, die PFADE aber nicht (Memory
 * „Umbenennung lässt Pfade zurück") — ein Verweis auf eine gelöschte Datei
 * sieht danach genauso aus wie ein gültiger. Er kostet erst beim nächsten
 * Nachschlagen Zeit, und dann viel.
 *
 * WAS GEPRÜFT WIRD — drei Durchgänge, alle rein lesend:
 *
 *   1. Markdown-Links `[Text](ziel)` auf Dateien im Repo (nicht http/mailto).
 *   2. `[[Wiki-Verweise]]` — nachgesehen am 2026-07-30: JEDER von ihnen zeigt
 *      auf eine Notiz AUSSERHALB des Repos (Davids Obsidian-Vault bzw. eine
 *      Claude-Memory-Notiz, eine trägt das sogar als „(Memory)" dabei). Diese
 *      Schreibweise bedeutet in diesem Repo also „Notiz außerhalb" und ist
 *      kein Dateiverweis. Sie werden deshalb aufgelistet, aber nie als Fehler
 *      gezählt — prüfbar wären sie nur gegen ein Verzeichnis auf Davids
 *      Rechner, und ein Wächter, der nur auf einer Maschine grün ist, ist
 *      keiner.
 *   3. Pfad-artige Angaben in `Backticks` — in der Doku UND in den
 *      Kopfkommentaren der Skripte. Das ist der Durchgang, der die
 *      Umbenennungen fängt: Links stehen selten auf Quelldateien, Fließtext
 *      dagegen ständig („… in `core/server/utils/presence.ts`").
 *
 * WIE AUFGELÖST WIRD: die Doku schreibt Layer-Pfade verkürzt („themes/shared/
 * ramp.ts" statt „packages/themes/shared/ramp.ts") — das ist gewachsene,
 * lesbare Konvention und wird hier NICHT zum Fehler erklärt. Ein Kandidat gilt
 * als gefunden, sobald er unter EINEM der üblichen Präfixe existiert
 * (`PREFIXES`) oder relativ zur prüfenden Datei liegt.
 *
 * WAS BEWUSST NICHT GEPRÜFT WIRD: Funktions- und Symbolnamen. `requireEntitlement`
 * ist kein Pfad, und eine Heuristik darauf meldete jeden Begriff, der einmal
 * anders hieß. Solche Verweise finden Menschen per grep; dieses Skript hält
 * das fest, was maschinell EINDEUTIG entscheidbar ist — sonst wird es
 * abgeschaltet, weil es zu oft schreit.
 *
 * PROTOKOLL VS. WEGWEISER — die Grenze, an der dieses Skript aufhört:
 *
 * `docs/archiv/**`, `docs/OPEN-ITEMS-COMPLETE.md` und die Phasen-Tabelle in
 * `README.md` sind PROTOKOLLE. Sie beschreiben einen Stand von damals, und ein
 * ausgeführter Plan wird nicht auf heute umgeschrieben (CLAUDE.md,
 * Doku-Ordnung). Ein Dateiname im Fließtext ist dort eine historische Aussage
 * („die Datei hieß damals so") — sie zu „korrigieren" wäre
 * Geschichtsfälschung, und deshalb sind Pfad-Angaben dort nur ein Hinweis.
 *
 * Ein Link auf ein DOKUMENT ist etwas anderes. Er verspricht „hier kannst Du
 * es nachlesen", und dieses Versprechen altert nicht: zieht die verlinkte
 * Datei um, muss der Link mitziehen — es ist ja dasselbe Dokument. Solche
 * Links werden ÜBERALL erzwungen, auch im Archiv.
 *
 * Ein Link auf eine QUELLDATEI ist dagegen wieder eine Momentaufnahme (das
 * Archiv verlinkt gern die Datei, um die es damals ging) und wird in
 * Protokollen wie eine Pfad-Angabe behandelt. `--strict` macht auch die
 * weichen Treffer zu Fehlern — für eine bewusste Durchsicht.
 *
 * Lauf: `node scripts/ops/verify-doc-links.mjs [--strict] [--json]`
 * Exit 0 = keine toten Verweise (außerhalb der Allowlist), sonst 1.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = new Set(process.argv.slice(2))
const STRICT = args.has('--strict')
const AS_JSON = args.has('--json')

/** Dokumente, die einen Stand von damals festhalten — siehe Kopf. */
const PROTOCOL = [/^docs\/archiv\//, /^docs\/OPEN-ITEMS-COMPLETE\.md$/, /^README\.md$/, /^CHANGELOG\.md$/]
const isProtocol = file => PROTOCOL.some(pattern => pattern.test(file))

/**
 * Zeigt der Verweis auf ein DOKUMENT (Navigation, muss immer stimmen) oder auf
 * eine Quelldatei (Momentaufnahme)? Siehe Kopf.
 */
const isNavigation = (kind, token) =>
  kind === 'doku-route' || (kind === 'link' && /\.md($|#)/.test(token))

/** Verzeichnisse, die nie eine Quelle der Wahrheit sind. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.nuxt', '.output', 'dist', '.data', 'coverage',
  'test-results', 'playwright-report', '.claude', '.pnpm-store',
])

/** Dateiendungen, die einen Backtick-Inhalt überhaupt zum Pfad-Kandidaten machen. */
const CODE_EXT = /\.(ts|mts|tsx|vue|mjs|cjs|js|md|json|jsonc|css|scss|ya?ml|sh|sql|toml|txt)$/

const dirNames = dir => readdirSync(join(ROOT, dir), { withFileTypes: true })
  .filter(entry => entry.isDirectory()).map(entry => entry.name)

/**
 * Präfixe, unter denen ein verkürzt geschriebener Pfad liegen darf.
 * Reihenfolge egal — es genügt EIN Treffer.
 *
 * JEDER Layer und jede App kommt dazu, weil die Doku ständig aus der Sicht
 * EINES Layers schreibt: „`scripts/generate-themes.ts`" meint
 * `packages/themes/scripts/generate-themes.ts`, „`scripts/og-images.mjs`"
 * meint `apps/marketing/scripts/og-images.mjs`. Ohne diese Präfixe meldete das
 * Skript jede solche Kurzform — und die ist nicht falsch, sondern die übliche
 * Schreibweise in diesem Repo.
 */
const PREFIXES = [
  '', 'packages/', 'apps/', 'docs/',
  ...dirNames('packages').map(name => `packages/${name}/`),
  ...dirNames('apps').map(name => `apps/${name}/`),
]

/** Layer- und App-Namen, wie die Doku sie als Kurzform benutzt („themes/shared/ramp.ts"). */
const LAYER_NAMES = new Set([...dirNames('packages'), ...dirNames('apps')])

/** Zweites Segment einer Kurzform: die Struktur-Ordner eines Layers. */
const LAYER_SUBDIRS = new Set(['server', 'app', 'shared', 'scripts', 'tests', 'i18n', 'e2e', 'schemas', 'public'])

/** Eindeutige Anfänge — hier ist ohne Zweifel ein Repo-Pfad gemeint. */
const ROOT_PREFIXES = ['packages/', 'apps/', 'scripts/', 'docs/', 'ci/', 'ops/', '.github/', './', '../']

/**
 * IST DAS ÜBERHAUPT EIN REPO-PFAD? Diese Frage entscheidet über den Wert des
 * ganzen Skripts.
 *
 * Die Doku ist voller Fragmente, die wie Pfade AUSSEHEN und keine sind:
 * `pages/login.vue` in einer Aufzählung, `users/[id].vue` als Bezeichnung
 * einer Dashboard-Seite, `src/main.js` im Beispiel-Repo eines fremden
 * Projekts. Jedes davon zu melden hieße, das Skript beim ersten Lauf
 * abzuschalten (der erste Entwurf meldete 120 Stellen, davon war eine Handvoll
 * echt). Deshalb zählt nur, was EINDEUTIG auf dieses Repo zeigt:
 *
 *   - ein Pfad ab Repo-Wurzel (`packages/…`, `scripts/…`, `docs/…`), oder
 *   - die gewachsene Layer-Kurzform: bekannter Layer-/App-Name + Struktur-
 *     Ordner (`core/server/…`, `themes/shared/…`) — beide Segmente werden
 *     gegen die WIRKLICHEN Verzeichnisse geprüft, die Liste pflegt sich also
 *     selbst.
 *
 * Alles andere ist Fließtext und geht das Skript nichts an.
 */
function looksLikeRepoPath(token) {
  if (ROOT_PREFIXES.some(prefix => token.startsWith(prefix))) return true
  const [first, second] = token.split('/')
  return LAYER_NAMES.has(first) && LAYER_SUBDIRS.has(second)
}

/**
 * ALLOWLIST — Verweise, die absichtlich ins Nichts zeigen, mit Grund.
 * Jeder Eintrag ist eine Entscheidung, keine Bequemlichkeit.
 */
const ALLOWLIST = [
  // Nicht eingecheckt (gitignored), aber in Betriebsanleitungen unverzichtbar.
  { pattern: /(^|\/)\.env/, why: 'Env-Dateien sind absichtlich nicht im Repo' },
  // Beispiel-/Platzhalterpfade in Anleitungen („lege X an").
  { pattern: /<[^>]+>|\{[^}]+\}|\$\{/, why: 'Platzhalter, kein echter Pfad' },
  // Erzeugte Artefakte, die erst ein Build/Deploy anlegt.
  { pattern: /^(\.output|\.nuxt|releases)\//, why: 'Build-/Deploy-Artefakt, entsteht erst zur Laufzeit' },
]

const allowed = token => ALLOWLIST.find(entry => entry.pattern.test(token))

/** Alle Dateien unter `dir`, die `match` erfüllen. */
function walk(dir, match, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) }
  catch { return out }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, match, out)
    else if (match(entry.name)) out.push(full)
  }
  return out
}

const exists = (path) => {
  try { statSync(path); return true }
  catch { return false }
}

/**
 * Existiert `token` — als Repo-Pfad, unter einem der PREFIXES oder relativ zur
 * Datei, die ihn nennt? Globs (`*`) werden auf ihr Elternverzeichnis
 * zurückgeführt: ob eine EINZELNE erzeugte Datei da ist, sagt nichts über die
 * Richtigkeit der Angabe.
 */
function resolves(token, fromFile) {
  const clean = token.split('#')[0].split('?')[0].trim()
  if (!clean) return true
  // Bei einem Glob zählt das Verzeichnis, nicht der Treffer: ob EINE erzeugte
  // Datei gerade da ist, sagt nichts über die Richtigkeit der Angabe.
  const globFree = clean.includes('*')
    ? clean.slice(0, clean.indexOf('*')).replace(/\/[^/]*$/, '')
    : clean
  if (!globFree) return true
  const candidates = [
    resolve(dirname(fromFile), globFree),
    ...PREFIXES.map(prefix => resolve(ROOT, prefix + globFree)),
  ]
  return candidates.some(exists)
}

const findings = []
const external = []
const record = (file, line, token, kind) => {
  if (allowed(token)) return
  const rel = relative(ROOT, file)
  // `[[…]]` meint in diesem Repo immer eine Notiz außerhalb — nie ein Fehler.
  if (kind === 'wiki') { external.push({ file: rel, line, token, kind }); return }
  const soft = !STRICT && isProtocol(rel) && !isNavigation(kind, token)
  findings.push({ file: rel, line, token, kind, soft })
}

/**
 * DIE ROUTEN DER DOKU-SITE (`docs/content/**` → control.pukalani.app/docs).
 *
 * Dort sind interne Links KEINE Dateipfade, sondern Nuxt-Content-Routen
 * (`/architektur/migrationen`). Ein toter Link darin ist besonders teuer: er
 * fällt niemandem beim Schreiben auf, sondern erst dem Leser als 404. Die
 * Route entsteht aus dem Dateinamen ohne Sortier-Präfix (`4.migrationen.md`),
 * `index` fällt weg.
 */
const CONTENT_DIR = join(ROOT, 'docs/content')
const CONTENT_ROUTES = new Set(
  walk(CONTENT_DIR, name => name.endsWith('.md')).map((file) => {
    const segments = relative(CONTENT_DIR, file).replace(/\.md$/, '').split('/')
      .map(segment => segment.replace(/^\d+\./, ''))
    if (segments.at(-1) === 'index') segments.pop()
    return `/${segments.join('/')}`.replace(/\/$/, '') || '/'
  }),
)

/** Durchgang 1+2: Links und Wiki-Verweise. */
function checkLinks(file, text) {
  const isContent = file.startsWith(CONTENT_DIR)
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1]
      if (/^(https?:|mailto:|tel:|#|\/\/)/.test(target)) continue
      if (target.startsWith('/')) {
        // Absolute Links sind Seiten-Routen, keine Dateipfade. Nur in der
        // Doku-Site lässt sich das prüfen — überall sonst ist es eine URL
        // einer der laufenden Apps und geht dieses Skript nichts an.
        if (isContent && !CONTENT_ROUTES.has(target.split('#')[0].replace(/\/$/, ''))) {
          record(file, index + 1, target, 'doku-route')
        }
        continue
      }
      if (!resolves(target, file)) record(file, index + 1, target, 'link')
    }
    for (const match of line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      const target = match[1].trim()
      // Obsidian-Verweise laufen ohne Endung — beide Formen probieren.
      if (!resolves(target, file) && !resolves(`${target}.md`, file)) {
        record(file, index + 1, target, 'wiki')
      }
    }
  })
}

/**
 * Durchgang 3: Pfad-artige Backtick-Inhalte.
 * Bedingung: enthält `/` UND endet auf eine Code-Endung. Ohne die Endung
 * träfe es jede API-Route (`/api/themes`) und jedes Berechtigungs-Kürzel.
 */
function checkPathTokens(file, text) {
  const lines = text.split('\n')
  let inFence = false
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return }
    if (inFence) return
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const token = match[1].trim()
      if (!token.includes('/') || !CODE_EXT.test(token.split('#')[0])) continue
      if (/\s/.test(token) || !looksLikeRepoPath(token)) continue
      if (!resolves(token, file)) record(file, index + 1, token, 'pfad')
    }
  })
}

/** Durchgang 3b: dieselbe Prüfung in Kommentarzeilen von Skripten. */
function checkScriptComments(file, text) {
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (!/^\s*(\/\/|\*|\/\*|#)/.test(line)) return
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const token = match[1].trim()
      if (!token.includes('/') || !CODE_EXT.test(token.split('#')[0])) continue
      if (/\s/.test(token) || !looksLikeRepoPath(token)) continue
      if (!resolves(token, file)) record(file, index + 1, token, 'skript-kommentar')
    }
  })
}

// ---------------------------------------------------------------------------

const markdown = [
  ...walk(join(ROOT, 'docs'), name => name.endsWith('.md')),
  ...['CLAUDE.md', 'AGENTS.md', 'README.md'].map(name => join(ROOT, name)).filter(exists),
]
for (const file of markdown) {
  const text = readFileSync(file, 'utf8')
  checkLinks(file, text)
  checkPathTokens(file, text)
}

const scripts = [
  ...walk(join(ROOT, 'scripts'), name => /\.(mjs|ts|mts)$/.test(name)),
  ...walk(join(ROOT, 'packages'), name => /\.(mjs|mts)$/.test(name)).filter(p => p.includes('/scripts/')),
]
for (const file of scripts) checkScriptComments(file, readFileSync(file, 'utf8'))

const hard = findings.filter(f => !f.soft)
const soft = findings.filter(f => f.soft)

if (AS_JSON) {
  console.log(JSON.stringify({ checked: markdown.length + scripts.length, hard, soft, external }, null, 2))
}
else {
  const show = (label, list) => {
    if (!list.length) return
    console.log(`\n${label} (${list.length}):`)
    for (const f of list) console.log(`  ${f.file}:${f.line}  [${f.kind}]  ${f.token}`)
  }
  console.log(`Doku-Verweise geprüft: ${markdown.length} Markdown-Dateien + ${scripts.length} Skripte`)
  show('TOTE VERWEISE', hard)
  show('Protokoll-Dokumente: Pfad-Angaben von damals (Hinweis, kein Fehler — --strict erzwingt sie)', soft)
  show('Notizen außerhalb des Repos ([[…]] — Obsidian-Vault / Claude-Memory, nie prüfbar)', external)
  if (!hard.length) console.log('\nOK — keine toten Verweise.')
}

process.exit(hard.length ? 1 : 0)
