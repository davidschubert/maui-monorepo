import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'
import type { DependencyEntry, HealthEntry, SystemInfo } from '../../../shared/types/system'

const require = createRequire(join(process.cwd(), 'package.json'))

/**
 * Aufgelöste Version eines Pakets — best effort. Erst direkter package.json-Import;
 * scheitert der (viele Pakete sperren ./package.json via "exports"), wird vom
 * aufgelösten Entry nach oben bis zur passenden package.json gelaufen.
 */
function pkgVersion(name: string): string {
  try {
    return (require(`${name}/package.json`) as { version?: string }).version ?? 'unknown'
  }
  catch {
    // exports-Sperre → über den Entry-Pfad nach oben suchen
  }
  try {
    let dir = dirname(require.resolve(name))
    for (let i = 0; i < 8; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string, version?: string }
        if (pkg.name === name) return pkg.version ?? 'unknown'
      }
      catch {
        // hier keine/andere package.json — weiter hoch
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  catch {
    // Entry nicht auflösbar (z.B. @nuxt/ui sperrt "." für require)
  }
  // Letzter Ausweg: node_modules/<name>/package.json direkt lesen (folgt pnpm-Symlinks,
  // umgeht die exports-Sperre). Vom cwd nach oben bis zum Root-node_modules.
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8')) as { version?: string }
      if (pkg.version) return pkg.version
    }
    catch {
      // hier nicht installiert — weiter hoch
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return 'unknown'
}

// Kategorisierte Laufzeit-Abhängigkeiten (Anzeige im System-Überblick)
const DEP_GROUPS: Record<string, string[]> = {
  Framework: ['nuxt', 'vue', '@nuxt/ui'],
  State: ['pinia', '@pinia/nuxt'],
  i18n: ['@nuxtjs/i18n'],
  Appwrite: ['node-appwrite', 'appwrite'],
  Validation: ['zod'],
  Icons: ['@iconify-json/ph', '@iconify-json/circle-flags'],
}
const LAYER_PKGS = ['@maui/core', '@maui/comments', '@maui/admin', '@maui/themes']
const MODULES = ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n']

/** Nicht-interne IPv4-Adressen des Servers */
function serverIps(): string[] {
  const result: string[] = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) result.push(iface.address)
    }
  }
  return result
}

interface HealthShape { status?: string, ping?: number, statuses?: HealthShape[] }

/** Health-Check robust ausführen — Fehler/fehlende Scopes → 'unknown' */
async function healthCheck(name: string, fn: () => Promise<HealthShape>): Promise<HealthEntry> {
  try {
    const result = await fn()
    const entry = Array.isArray(result.statuses) ? result.statuses[0] : result
    const status = entry?.status === 'pass' || entry?.status === 'fail' ? entry.status : 'pass'
    return { name, status, ping: typeof entry?.ping === 'number' ? entry.ping : null }
  }
  catch {
    return { name, status: 'unknown', ping: null }
  }
}

/**
 * System-/Ops-Überblick: Laufzeit, Appwrite-Version + Live-Health, Server-IPs,
 * App-Info und aufgelöste Dependency-Versionen. Admin-only.
 */
export default defineEventHandler(async (event): Promise<SystemInfo> => {
  requireAdmin(event)

  const config = useRuntimeConfig(event)
  const endpoint = config.public.appwriteEndpoint
  const projectId = config.public.appwriteProjectId
  const { health } = createAdminClient(event)

  // Appwrite-Serverversion (öffentlicher health/version-Endpoint, kein Key nötig)
  let version: string | null = null
  try {
    const res = await $fetch<{ version: string }>(`${endpoint}/health/version`, {
      headers: { 'X-Appwrite-Project': projectId },
    })
    version = res.version
  }
  catch {
    version = null
  }

  const [api, db, cache, storage] = await Promise.all([
    healthCheck('API', () => health.get()),
    healthCheck('Database', () => health.getDB()),
    healthCheck('Cache', () => health.getCache()),
    healthCheck('Storage', () => health.getStorage()),
  ])

  let timeDiffMs: number | null = null
  try {
    timeDiffMs = (await health.getTime()).diff
  }
  catch {
    timeDiffMs = null
  }

  const dependencies: DependencyEntry[] = []
  for (const [category, names] of Object.entries(DEP_GROUPS)) {
    for (const name of names) dependencies.push({ name, version: pkgVersion(name), category })
  }
  const layers: DependencyEntry[] = LAYER_PKGS.map(name => ({ name, version: pkgVersion(name), category: 'Layer' }))

  let appName = 'app'
  let appVersion = 'unknown'
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { name?: string, version?: string }
    appName = pkg.name ?? appName
    appVersion = pkg.version ?? appVersion
  }
  catch {
    // package.json nicht lesbar — Defaults
  }

  const memory = process.memoryUsage()

  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.round(process.uptime()),
      memoryRssBytes: memory.rss,
      memoryHeapUsedBytes: memory.heapUsed,
      nodeEnv: process.env.NODE_ENV ?? 'development',
    },
    appwrite: {
      version,
      endpoint,
      projectId,
      databaseId: config.public.appwriteDatabaseId,
      timeDiffMs,
      health: [api, db, cache, storage],
    },
    server: {
      hostname: os.hostname(),
      ipAddresses: serverIps(),
    },
    app: {
      name: appName,
      version: appVersion,
      url: config.public.appUrl,
      avatarsBucket: config.public.appwriteAvatarsBucket || null,
    },
    layers,
    dependencies,
    modules: MODULES,
  }
})
