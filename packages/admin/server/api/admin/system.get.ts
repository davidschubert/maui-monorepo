import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import type { DependencyEntry, HealthEntry, LayerInfo, SystemInfo } from '../../../shared/types/system'
import { DEP_GROUPS, isOutdated, latestAppwriteVersion, latestVersion, pkgVersion } from '../../utils/dependencies'
import { layerBreakdown } from '../../utils/layers'

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
    // Leere statuses-Liste / unerwarteter Shape → 'unknown', nicht 'pass'
    // (sonst meldet ein Endpoint ohne verwertbares Ergebnis fälschlich „gesund").
    const status = entry?.status === 'pass' || entry?.status === 'fail' ? entry.status : 'unknown'
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
  requirePermission(event, 'system.manage')

  const config = useRuntimeConfig(event)
  const endpoint = config.public.appwriteEndpoint
  const projectId = config.public.appwriteProjectId
  const { health } = createAdminClient(event)

  // Appwrite-Serverversion (öffentlicher health/version-Endpoint, kein Key nötig)
  // + neueste Release-Version von GitHub (Cache) parallel.
  const [versionRes, latestAppwrite] = await Promise.all([
    $fetch<{ version: string }>(`${endpoint}/health/version`, {
      headers: { 'X-Appwrite-Project': projectId },
    }).catch(() => null),
    latestAppwriteVersion(),
  ])
  const version: string | null = versionRes?.version ?? null
  const appwriteOutdated = isOutdated(version ?? '', latestAppwrite)

  const [api, db, cache, storage] = await Promise.all([
    healthCheck('API', () => health.get()),
    healthCheck('Database', () => health.getDB()),
    healthCheck('Cache', () => health.getCache()),
    healthCheck('Storage', () => health.getStorage()),
  ])

  let timeDiffMs: number | null
  try {
    timeDiffMs = (await health.getTime()).diff
  }
  catch {
    timeDiffMs = null
  }

  const depDefs: { name: string, category: string }[] = []
  for (const [category, names] of Object.entries(DEP_GROUPS)) {
    for (const name of names) depDefs.push({ name, category })
  }
  // Versionen lokal auflösen + latest parallel von npm holen (Cache + Timeout)
  const dependencies: DependencyEntry[] = await Promise.all(
    depDefs.map(async ({ name, category }) => {
      const version = pkgVersion(name)
      const latest = await latestVersion(name)
      return { name, version, category, latest, outdated: isOutdated(version, latest) }
    }),
  )
  const layers: LayerInfo[] = LAYER_PKGS.map(name => layerBreakdown(name, pkgVersion(name)))

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
      latestVersion: latestAppwrite,
      outdated: appwriteOutdated,
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
