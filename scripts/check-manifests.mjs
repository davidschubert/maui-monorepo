#!/usr/bin/env node
/**
 * Manifest-Check (Strategie F1) — beendet die Doppelpflege von `extends` +
 * `package.json`: das Site-Manifest ist die Single Source of Truth, dieses
 * Script erzwingt Konsistenz. Läuft in der CI (lint) und lokal:
 *
 *   pnpm check:manifests
 *
 * Prüfungen:
 *  1. Jeder Layer unter packages/ hat ein Zod-valides feature.manifest.ts;
 *     key === Ordnername; Manifeste nutzen nur `import type` (Erasability
 *     für --experimental-strip-types).
 *  2. hasMigrations ⇔ scripts/migrations/ existiert; jeder Layer mit
 *     Migrationen steht in der LAYER_ORDER von scripts/migrate.mjs (Drift!).
 *  3. Jede App unter apps/ hat ein Zod-valides site.manifest.ts; siteId ===
 *     Ordnername (ohne führenden Unterstrich); Features existieren;
 *     requires-Schluss erfüllt (transitiv).
 *  4. extends in nuxt.config.ts = Features in kanonischer EXTENDS_ORDER
 *     + core + system am Ende (früher gelistet = höhere Priorität).
 *  5. @maui/*-Dependencies in package.json = exakt Features + core + system.
 *
 * Ausgabe pro Verstoß eine Zeile (Datei · erwartet/ist), Exit 1 bei Fehlern.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Kanonische extends-Reihenfolge (IST der reddit-comments-App): UI-/Feature-
// Layer zuerst (höchste Priorität), Fundament core → system am Ende.
const EXTENDS_ORDER = [
  'themes', 'admin', 'comments', 'posts', 'events', 'media', 'feedback',
  'billing', 'courses', 'tickets', 'activity', 'moderation',
]
const FOUNDATION_ALWAYS = ['core', 'system']

const errors = []
const err = (msg) => errors.push(msg)

const { featureManifestSchema, siteManifestSchema } = await import(
  pathToFileURL(join(ROOT, 'packages/core/shared/utils/manifestSchema.ts')).href
)

function listDirs(parent) {
  return readdirSync(join(ROOT, parent), { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
}

/** Nur `import type` erlaubt — Wert-Importe brechen das Strip-Types-Laden. */
function checkTypeOnlyImports(file, rel) {
  const src = readFileSync(file, 'utf8')
  const valueImport = src.match(/^import\s+(?!type\s)[^\n]*$/m)
  if (valueImport) err(`${rel}: Wert-Import gefunden („${valueImport[0].trim()}") — Manifeste dürfen nur \`import type\` nutzen`)
}

// ── 1+2: Feature-Manifeste ────────────────────────────────────────────────
const layers = listDirs('packages')
const manifests = new Map()

for (const layer of layers) {
  const rel = `packages/${layer}/feature.manifest.ts`
  const file = join(ROOT, rel)
  if (!existsSync(file)) {
    err(`${rel}: fehlt — jeder Layer braucht ein Feature-Manifest`)
    continue
  }
  checkTypeOnlyImports(file, rel)

  let manifest
  try {
    manifest = (await import(pathToFileURL(file).href)).default
  }
  catch (e) {
    err(`${rel}: nicht ladbar — ${e.message}`)
    continue
  }
  const parsed = featureManifestSchema.safeParse(manifest)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) err(`${rel}: ${issue.path.join('.') || '(root)'} — ${issue.message}`)
    continue
  }
  if (parsed.data.key !== layer) err(`${rel}: key „${parsed.data.key}" ≠ Ordnername „${layer}"`)

  const hasDir = existsSync(join(ROOT, 'packages', layer, 'scripts', 'migrations'))
  if (parsed.data.hasMigrations !== hasDir) {
    err(`${rel}: hasMigrations=${parsed.data.hasMigrations}, aber scripts/migrations/ ${hasDir ? 'existiert' : 'fehlt'}`)
  }
  manifests.set(layer, parsed.data)
}

// requires müssen existieren
for (const [layer, m] of manifests) {
  for (const req of m.requires ?? []) {
    if (!manifests.has(req)) err(`packages/${layer}/feature.manifest.ts: requires „${req}" — Layer existiert nicht`)
  }
}

// Destruktiv-Guard (M3): zerstörerische Appwrite-Aufrufe in Migrationen nur
// mit Marker `// destruktiv-ok: <Begründung>` — additiv-sicher ist Default,
// jede Ausnahme muss begründet UND geguardet sein (Audit: M3-MIGRATIONS-AUDIT).
{
  const destructivePattern = /\.(deleteTable|deleteColumn|deleteIndex|deleteRow|deleteRows|update\w*Column)\s*\(/g
  for (const layer of layers) {
    const dir = join(ROOT, 'packages', layer, 'scripts', 'migrations')
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.ts')) continue
      const rel = `packages/${layer}/scripts/migrations/${entry}`
      const src = readFileSync(join(dir, entry), 'utf8')
      const calls = [...src.matchAll(destructivePattern)].map(m => m[1])
      if (calls.length > 0 && !src.includes('destruktiv-ok:')) {
        err(`${rel}: zerstörerische Aufrufe (${[...new Set(calls)].join(', ')}) ohne \`// destruktiv-ok:\`-Marker — Guard + Begründung nötig (M3)`)
      }
    }
  }
}

// LAYER_ORDER-Drift gegen scripts/migrate.mjs
{
  const migrateSrc = readFileSync(join(ROOT, 'scripts/migrate.mjs'), 'utf8')
  const match = migrateSrc.match(/const LAYER_ORDER = \[([^\]]+)\]/)
  if (!match) {
    err('scripts/migrate.mjs: LAYER_ORDER nicht gefunden — Drift-Check unmöglich')
  }
  else {
    const order = [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1])
    for (const [layer, m] of manifests) {
      if (m.hasMigrations && !order.includes(layer)) err(`scripts/migrate.mjs: Layer „${layer}" hat Migrationen, fehlt aber in LAYER_ORDER`)
    }
    for (const entry of order) {
      if (!manifests.get(entry)?.hasMigrations) err(`scripts/migrate.mjs: LAYER_ORDER enthält „${entry}", der Layer hat aber keine Migrationen (mehr)`)
    }
  }
}

// ── 3–5: Site-Manifeste + extends + package.json ──────────────────────────
for (const app of listDirs('apps')) {
  const rel = `apps/${app}/site.manifest.ts`
  const file = join(ROOT, rel)
  if (!existsSync(file)) {
    err(`${rel}: fehlt — jede App braucht ein Site-Manifest`)
    continue
  }
  checkTypeOnlyImports(file, rel)

  let site
  try {
    site = (await import(pathToFileURL(file).href)).default
  }
  catch (e) {
    err(`${rel}: nicht ladbar — ${e.message}`)
    continue
  }
  const parsed = siteManifestSchema.safeParse(site)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) err(`${rel}: ${issue.path.join('.') || '(root)'} — ${issue.message}`)
    continue
  }
  const { siteId, features } = parsed.data

  if (siteId !== app.replace(/^_/, '')) err(`${rel}: siteId „${siteId}" ≠ App-Ordner „${app}" (ohne führenden Unterstrich)`)
  if (new Set(features).size !== features.length) err(`${rel}: doppelte Feature-Einträge`)

  for (const f of features) {
    if (!manifests.has(f)) err(`${rel}: Feature „${f}" existiert nicht unter packages/`)
    if (FOUNDATION_ALWAYS.includes(f)) err(`${rel}: „${f}" ist implizit immer dabei — nicht listen`)
  }

  // requires-Schluss (transitiv)
  const missing = new Set()
  const visit = (key) => {
    for (const req of manifests.get(key)?.requires ?? []) {
      if (!features.includes(req)) missing.add(`${key} → ${req}`)
      else visit(req)
    }
  }
  for (const f of features) visit(f)
  for (const m of missing) err(`${rel}: requires verletzt — ${m} fehlt in features`)

  // extends-Konsistenz (Menge + kanonische Reihenfolge)
  const expected = [
    ...EXTENDS_ORDER.filter(l => features.includes(l)),
    ...features.filter(f => !EXTENDS_ORDER.includes(f)), // neue Layer: ans Ende der Features
    ...FOUNDATION_ALWAYS,
  ].map(l => `../../packages/${l}`)
  const nuxtSrc = readFileSync(join(ROOT, 'apps', app, 'nuxt.config.ts'), 'utf8')
  const extendsMatch = nuxtSrc.match(/extends:\s*\[([^\]]+)\]/)
  if (!extendsMatch) {
    err(`apps/${app}/nuxt.config.ts: extends-Array nicht gefunden`)
  }
  else {
    const actual = [...extendsMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      err(`apps/${app}/nuxt.config.ts: extends passt nicht zum Site-Manifest\n    erwartet: [${expected.join(', ')}]\n    ist:      [${actual.join(', ')}]`)
    }
  }

  // package.json-Konsistenz (@maui/*-Menge)
  const pkg = JSON.parse(readFileSync(join(ROOT, 'apps', app, 'package.json'), 'utf8'))
  const actualDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter(d => d.startsWith('@maui/')).map(d => d.slice('@maui/'.length)).sort()
  const expectedDeps = [...features, ...FOUNDATION_ALWAYS].sort()
  const missingDeps = expectedDeps.filter(d => !actualDeps.includes(d))
  const extraDeps = actualDeps.filter(d => !expectedDeps.includes(d))
  for (const d of missingDeps) err(`apps/${app}/package.json: @maui/${d} fehlt (im Site-Manifest gewählt)`)
  for (const d of extraDeps) err(`apps/${app}/package.json: @maui/${d} überzählig (nicht im Site-Manifest)`)
}

// ── Ergebnis ──────────────────────────────────────────────────────────────
if (errors.length) {
  console.error(`✗ Manifest-Check: ${errors.length} Verstoß/Verstöße\n`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`✔ Manifest-Check: ${manifests.size} Layer, ${listDirs('apps').length} Apps — konsistent`)
