#!/usr/bin/env node
/**
 * Zentraler Migrations-Runner — löst die frühere Pinnung aller Layer-Migrations
 * auf apps/comments/.env. Jede App hat ihre EIGENE Appwrite-Instanz;
 * der Runner macht explizit, GEGEN WELCHE davon migriert wird.
 *
 *   pnpm migrate --app <app>            # alle Layer gegen apps/<app>/.env
 *   pnpm migrate --app <app> --layer comments   # nur ein Layer
 *   pnpm migrate --env-file /pfad/.env  # explizite Env-Datei (z. B. CI/Prod)
 *
 * Ohne --app/--env-file: gibt es GENAU EINE App unter apps/ (Template zählt
 * nicht), wird sie genommen — bei mehreren Apps ist die Angabe Pflicht, damit
 * nie versehentlich die falsche Instanz migriert wird.
 *
 * Layer-Reihenfolge: Fundament zuerst (system → comments → moderation → admin);
 * innerhalb eines Layers laufen die Scripts lexikografisch nach Dateiname
 * (deterministisch; Nummern-Präfixe eindeutig halten). Die Scripts selbst
 * bleiben idempotent (409 → skip) — der Runner ist nur der Dispatcher.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Fundament zuerst — admin liest z. B. Tables, die system/comments anlegen.
const LAYER_ORDER = ['system', 'comments', 'posts', 'events', 'media', 'feedback', 'billing', 'courses', 'tickets', 'moderation', 'studio', 'admin']

function parseArgs(argv) {
  const args = { app: null, envFile: null, layers: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--app') args.app = argv[++i]
    else if (argv[i] === '--env-file') args.envFile = argv[++i]
    else if (argv[i] === '--layer') args.layers.push(argv[++i])
    else {
      console.error(`✗ Unbekanntes Argument: ${argv[i]}\n  Nutzung: pnpm migrate [--app <app>] [--env-file <pfad>] [--layer <layer>]…`)
      process.exit(1)
    }
  }
  return args
}

function listApps() {
  return readdirSync(join(ROOT, 'apps'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map(entry => entry.name)
}

function resolveEnvFile({ app, envFile }) {
  if (envFile) {
    const abs = resolve(process.cwd(), envFile)
    if (!existsSync(abs)) {
      console.error(`✗ Env-Datei nicht gefunden: ${abs}`)
      process.exit(1)
    }
    return { envFile: abs, label: abs }
  }

  let target = app
  if (!target) {
    const apps = listApps()
    if (apps.length === 1) {
      target = apps[0]
    }
    else {
      console.error(`✗ Mehrere Apps gefunden (${apps.join(', ')}) — Ziel-Instanz explizit angeben:\n  pnpm migrate --app <app>`)
      process.exit(1)
    }
  }

  const abs = join(ROOT, 'apps', target, '.env')
  if (!existsSync(abs)) {
    console.error(`✗ apps/${target}/.env existiert nicht — App-Name prüfen oder .env aus .env.example anlegen.`)
    process.exit(1)
  }
  return { envFile: abs, label: `apps/${target}/.env`, app: target }
}

/**
 * Feature-Wahl der App (site.manifest.ts, M4): Ohne explizite --layer-Angabe
 * migriert der Runner nur die Layer, die die Site laut Manifest nutzt
 * (+ system als implizites Fundament) — eine Site ohne courses bekommt keine
 * courses-Tables. Braucht --experimental-strip-types (root-Script setzt es).
 */
async function manifestFeaturesOf(app) {
  const file = join(ROOT, 'apps', app, 'site.manifest.ts')
  if (!existsSync(file)) return null
  try {
    const manifest = (await import(pathToFileURL(file).href)).default
    return Array.isArray(manifest?.features) ? manifest.features : null
  }
  catch (error) {
    console.warn(`⚠ site.manifest.ts nicht ladbar (${error.message}) — migriere ALLE Layer.`)
    return null
  }
}

function migrationsOf(layer) {
  const dir = join(ROOT, 'packages', layer, 'scripts', 'migrations')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => /^\d{3}-.*\.ts$/.test(name))
    .sort()
    .map(name => join(dir, name))
}

const args = parseArgs(process.argv.slice(2))
const { envFile, label, app } = resolveEnvFile(args)

let layers = args.layers.length > 0 ? args.layers : LAYER_ORDER
for (const layer of layers) {
  if (!LAYER_ORDER.includes(layer)) {
    console.error(`✗ Unbekannter Layer '${layer}' — bekannt: ${LAYER_ORDER.join(', ')}`)
    process.exit(1)
  }
}

// Manifest-Filter (M4): nur bei App-Kontext und ohne explizite --layer-Wahl
if (args.layers.length === 0 && app) {
  const features = await manifestFeaturesOf(app)
  if (features) {
    const skipped = LAYER_ORDER.filter(l => l !== 'system' && !features.includes(l))
    layers = LAYER_ORDER.filter(l => l === 'system' || features.includes(l))
    if (skipped.length > 0) console.log(`↷ Nicht im Site-Manifest — übersprungen: ${skipped.join(', ')}\n`)
  }
}

console.log(`Migrationen gegen ${label}\n`)

for (const layer of layers) {
  const files = migrationsOf(layer)
  if (files.length === 0) continue
  console.log(`▸ ${layer} (${files.length} Migrationen)`)
  for (const file of files) {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', `--env-file=${envFile}`, file],
      { stdio: 'inherit', cwd: join(ROOT, 'packages', layer) },
    )
    if (result.status !== 0) {
      console.error(`\n✗ Migration fehlgeschlagen: ${file}`)
      process.exit(result.status ?? 1)
    }
  }
}

console.log('\n✔ Alle Migrationen abgeschlossen.')
