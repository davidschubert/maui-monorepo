import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LayerCategory, LayerInfo } from '../../shared/types/system'

/** Monorepo-Root finden: vom cwd nach oben bis pnpm-workspace.yaml liegt. */
function workspaceRoot(): string | null {
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** Dateien in einem Verzeichnis zählen (optional rekursiv, optional Namensfilter). */
function countFiles(dir: string, exts: string[], recursive: boolean, namePattern?: RegExp): number {
  if (!existsSync(dir)) return 0
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      if (recursive) count += countFiles(join(dir, entry.name), exts, true, namePattern)
      continue
    }
    if (!exts.some(e => entry.name.endsWith(e))) continue
    if (namePattern && !namePattern.test(entry.name)) continue
    count++
  }
  return count
}

// Inhalts-Kategorien eines Nuxt-Layers (key wird im UI via i18n übersetzt).
const CATEGORIES: { key: string, path: string, exts: string[], recursive: boolean, namePattern?: RegExp }[] = [
  { key: 'components', path: 'app/components', exts: ['.vue'], recursive: true },
  { key: 'composables', path: 'app/composables', exts: ['.ts'], recursive: false },
  { key: 'stores', path: 'app/stores', exts: ['.ts'], recursive: false },
  { key: 'pages', path: 'app/pages', exts: ['.vue'], recursive: true },
  { key: 'layouts', path: 'app/layouts', exts: ['.vue'], recursive: false },
  { key: 'middleware', path: 'app/middleware', exts: ['.ts'], recursive: false },
  { key: 'plugins', path: 'app/plugins', exts: ['.ts'], recursive: false },
  { key: 'serverRoutes', path: 'server/api', exts: ['.ts'], recursive: true },
  { key: 'serverUtils', path: 'server/utils', exts: ['.ts'], recursive: false },
  // Nur nummerierte Migrationen (NNN-…), keine Helfer wie verify-schema.ts
  { key: 'migrations', path: 'scripts/migrations', exts: ['.ts'], recursive: false, namePattern: /^\d{3}-.*\.ts$/ },
  { key: 'types', path: 'shared/types', exts: ['.ts'], recursive: false },
  { key: 'locales', path: 'i18n/locales', exts: ['.json'], recursive: false },
]

/**
 * Inhaltsaufschlüsselung eines Feature-Layers (@maui/<short> → packages/<short>):
 * Datei-Anzahl je Kategorie. Best effort aus dem Dateisystem — fehlt das
 * Quellverzeichnis (z.B. exotisches Prod-Layout), bleibt categories leer.
 */
export function layerBreakdown(name: string, version: string): LayerInfo {
  const root = workspaceRoot()
  const short = name.replace('@maui/', '')
  const dir = root ? join(root, 'packages', short) : null

  let description: string | null = null
  const categories: LayerCategory[] = []
  let total = 0

  if (dir && existsSync(dir)) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { description?: string }
      description = pkg.description ?? null
    }
    catch {
      // keine/unlesbare package.json — ohne Beschreibung
    }
    for (const c of CATEGORIES) {
      const count = countFiles(join(dir, c.path), c.exts, c.recursive, c.namePattern)
      if (count > 0) {
        categories.push({ key: c.key, count })
        total += count
      }
    }
  }

  return { name, version, description, total, categories }
}
