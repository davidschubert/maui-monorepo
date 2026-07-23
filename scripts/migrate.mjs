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
 * WELLEN-MODUS (H3-4.2, Blueprint L5) — Silo-Schema-Updates in drei Wellen
 * (internal → canary → stable), Pool migriert separat genau einmal:
 *
 *   pnpm migrate --wave internal --control-env /pfad/studio.env [--layer …]
 *
 * --control-env zeigt auf die CONTROL-PLANE-Instanz (studio); daraus kommen
 * die Silo-Projekte der Welle (tenants.wave, '' = stable). Je Projekt braucht
 * es eine Migrations-Env-Datei ~/.appwrite-secrets/migrations/<projectId>.env
 * (Format wie jede App-.env: NUXT_PUBLIC_APPWRITE_* + Migrations-Key;
 * --keys-dir überschreibt den Ordner). Fehlt eine Datei, bricht der Lauf ab
 * BEVOR irgendein Projekt migriert wird (fail-loud statt halber Welle).
 * Ablauf eines Schema-Rollouts: additive Migration (Code n-1 verträgt Schema n)
 * → wave internal → verifizieren → canary → stable → Code-Deploy → Aufräum-
 * Migration später (Details: docs/DEPLOYMENT.md).
 *
 * Layer-Reihenfolge: Fundament zuerst (system → comments → moderation → admin);
 * innerhalb eines Layers laufen die Scripts lexikografisch nach Dateiname
 * (deterministisch; Nummern-Präfixe eindeutig halten). Die Scripts selbst
 * bleiben idempotent (409 → skip) — der Runner ist nur der Dispatcher.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WAVES = ['internal', 'canary', 'stable']
// Fundament zuerst — admin liest z. B. Tables, die system/comments anlegen.
const LAYER_ORDER = ['system', 'comments', 'posts', 'events', 'media', 'feedback', 'billing', 'pages', 'courses', 'tickets', 'moderation', 'studio', 'admin']

function parseArgs(argv) {
  const args = { app: null, envFile: null, layers: [], wave: null, controlEnv: null, keysDir: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--app') args.app = argv[++i]
    else if (argv[i] === '--env-file') args.envFile = argv[++i]
    else if (argv[i] === '--layer') args.layers.push(argv[++i])
    else if (argv[i] === '--wave') args.wave = argv[++i]
    else if (argv[i] === '--control-env') args.controlEnv = argv[++i]
    else if (argv[i] === '--keys-dir') args.keysDir = argv[++i]
    else {
      console.error(`✗ Unbekanntes Argument: ${argv[i]}\n  Nutzung: pnpm migrate [--app <app>] [--env-file <pfad>] [--layer <layer>]…\n          pnpm migrate --wave <${WAVES.join('|')}> --control-env <pfad> [--keys-dir <ordner>] [--layer <layer>]…`)
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

function runMigrations(envFile, layers, label) {
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
}

function validateLayers(layers) {
  for (const layer of layers) {
    if (!LAYER_ORDER.includes(layer)) {
      console.error(`✗ Unbekannter Layer '${layer}' — bekannt: ${LAYER_ORDER.join(', ')}`)
      process.exit(1)
    }
  }
}

/** Wellen-Modus: Silo-Projekte der Welle übers Control Plane auflösen und
 *  nacheinander migrieren. Fehlende Key-Dateien brechen VOR dem ersten
 *  Projekt ab — keine halbe Welle. */
function runWave(args, layers) {
  if (args.app || args.envFile) {
    console.error('✗ --wave verträgt sich nicht mit --app/--env-file (Pool/Einzel-Instanz separat migrieren).')
    process.exit(1)
  }
  if (!WAVES.includes(args.wave)) {
    console.error(`✗ Unbekannte Welle '${args.wave}' — erwartet: ${WAVES.join(' | ')}`)
    process.exit(1)
  }
  if (!args.controlEnv) {
    console.error('✗ --control-env fehlt (Env-Datei der Control-Plane-/studio-Instanz) — nie raten, gegen welches Register aufgelöst wird.')
    process.exit(1)
  }
  const controlEnv = resolve(process.cwd(), args.controlEnv)
  if (!existsSync(controlEnv)) {
    console.error(`✗ Control-Env nicht gefunden: ${controlEnv}`)
    process.exit(1)
  }

  const list = spawnSync(
    process.execPath,
    ['--experimental-strip-types', `--env-file=${controlEnv}`, join(ROOT, 'packages', 'studio', 'scripts', 'list-silo-tenants.ts'), args.wave],
    { cwd: join(ROOT, 'packages', 'studio'), encoding: 'utf8' },
  )
  if (list.status !== 0) {
    console.error(list.stderr || '✗ Silo-Tenants konnten nicht gelistet werden.')
    process.exit(list.status ?? 1)
  }
  const projects = JSON.parse(list.stdout.trim().split('\n').at(-1))
  if (projects.length === 0) {
    console.log(`✔ Welle '${args.wave}': keine Silo-Projekte im Register — nichts zu migrieren.`)
    return
  }

  const keysDir = args.keysDir
    ? resolve(process.cwd(), args.keysDir)
    : join(homedir(), '.appwrite-secrets', 'migrations')
  const missing = projects.filter(projectId => !existsSync(join(keysDir, `${projectId}.env`)))
  if (missing.length > 0) {
    console.error(`✗ Migrations-Env fehlt für: ${missing.join(', ')}\n  Erwartet: ${keysDir}/<projectId>.env (NUXT_PUBLIC_APPWRITE_* + NUXT_APPWRITE_MIGRATIONS_KEY).`)
    process.exit(1)
  }

  console.log(`Welle '${args.wave}': ${projects.length} Silo-Projekt(e) — ${projects.join(', ')}\n`)
  for (const projectId of projects) {
    runMigrations(join(keysDir, `${projectId}.env`), layers, `Silo-Projekt ${projectId} (Welle ${args.wave})`)
  }
}

const args = parseArgs(process.argv.slice(2))
const explicitLayers = args.layers.length > 0 ? args.layers : LAYER_ORDER
validateLayers(explicitLayers)

if (args.wave) {
  runWave(args, explicitLayers)
  console.log('\n✔ Alle Migrationen abgeschlossen.')
}
else {
  const { envFile, label, app } = resolveEnvFile(args)
  let layers = explicitLayers

  // Manifest-Filter (M4): nur bei App-Kontext und ohne explizite --layer-Wahl
  if (args.layers.length === 0 && app) {
    const features = await manifestFeaturesOf(app)
    if (features) {
      const skipped = LAYER_ORDER.filter(l => l !== 'system' && !features.includes(l))
      layers = LAYER_ORDER.filter(l => l === 'system' || features.includes(l))
      if (skipped.length > 0) console.log(`↷ Nicht im Site-Manifest — übersprungen: ${skipped.join(', ')}\n`)
    }
  }

  runMigrations(envFile, layers, label)
  console.log('\n✔ Alle Migrationen abgeschlossen.')
}
