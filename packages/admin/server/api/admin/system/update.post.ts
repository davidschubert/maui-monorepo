import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { ALL_DEP_NAMES, latestVersion, pkgVersion } from '../../../utils/dependencies'

const schema = z.object({
  name: z.string().min(1),
})

/** Monorepo-Root finden: vom cwd nach oben bis pnpm-workspace.yaml liegt. */
function findWorkspaceRoot(): string | null {
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Hebt die Catalog-Version eines Pakets in pnpm-workspace.yaml auf ^<version> an.
 * Gibt true zurück, wenn ein Eintrag gefunden + ersetzt wurde.
 */
function bumpCatalogVersion(yamlPath: string, name: string, version: string): boolean {
  const content = readFileSync(yamlPath, 'utf8')
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Key kann quoted ('@nuxt/ui') oder unquoted (vue) sein; Wert ist ein Version-Range.
  const re = new RegExp(`(^\\s*(?:'${esc}'|"${esc}"|${esc})\\s*:\\s*)([\\^~]?\\d[\\w.\\-]*)(\\s*$)`, 'm')
  if (!re.test(content)) return false
  writeFileSync(yamlPath, content.replace(re, `$1^${version}$3`), 'utf8')
  return true
}

/**
 * Dev-only: hebt die Version eines (whitelisteten) Pakets im pnpm-Catalog an und
 * läuft `pnpm install`. In Produktion bewusst gesperrt — die deployte App läuft
 * aus dem gebauten Output, dort gibt es kein Repo/pnpm zum Mutieren. Admin-only.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  // Harte Sperre: niemals in Produktion erreichbar.
  if (!import.meta.dev) {
    throw createError({ status: 403, statusText: 'Dependency updates are only available in development' })
  }

  const { name } = await readValidatedBody(event, schema.parse)

  // Whitelist: nur bekannte Pakete — keine beliebigen Namen (kein Command-/File-Risiko).
  if (!ALL_DEP_NAMES.includes(name)) {
    throw createError({ status: 400, statusText: 'Unknown dependency' })
  }

  const root = findWorkspaceRoot()
  if (!root) {
    throw createError({ status: 500, statusText: 'pnpm-workspace.yaml not found' })
  }

  const target = await latestVersion(name)
  if (!target) {
    throw createError({ status: 502, statusText: 'Could not resolve latest version from npm' })
  }
  const from = pkgVersion(name)

  const yamlPath = join(root, 'pnpm-workspace.yaml')
  const bumped = bumpCatalogVersion(yamlPath, name, target)
  if (!bumped) {
    throw createError({ status: 422, statusText: `No catalog entry for ${name} in pnpm-workspace.yaml` })
  }

  // pnpm install DETACHED starten: läuft als eigenständiger Prozess weiter, auch
  // wenn der Dev-Server beim Lockfile-/node_modules-Schreiben neu lädt (sonst würde
  // der Install als Kind-Prozess mittendrin gekillt → inkonsistenter Zustand).
  // Ohne Shell, fixe Argumente — der Paketname fließt nie in den Befehl ein.
  try {
    const child = spawn('pnpm', ['install'], { cwd: root, detached: true, stdio: 'ignore' })
    child.on('error', () => {}) // z.B. ENOENT (pnpm nicht im PATH) nicht als unhandled werfen
    child.unref()
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw createError({ status: 500, statusText: `Could not start pnpm install: ${msg}` })
  }

  // Sofort zurück: der Install läuft im Hintergrund. Der Client wartet NICHT auf
  // Fertigstellung (die Antwort ginge beim Dev-Server-Reload eh verloren).
  return { name, from, to: target, started: true }
})
