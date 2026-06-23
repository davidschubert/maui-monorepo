import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(join(process.cwd(), 'package.json'))

// Kategorisierte Laufzeit-Abhängigkeiten (Anzeige + Update-Whitelist).
export const DEP_GROUPS: Record<string, string[]> = {
  Framework: ['nuxt', 'vue', '@nuxt/ui'],
  State: ['pinia', '@pinia/nuxt'],
  i18n: ['@nuxtjs/i18n'],
  Appwrite: ['node-appwrite', 'appwrite'],
  Validation: ['zod'],
  Icons: ['@iconify-json/ph', '@iconify-json/circle-flags'],
}

/** Flache Liste aller bekannten Pakete — Whitelist für den Update-Endpoint. */
export const ALL_DEP_NAMES: string[] = Object.values(DEP_GROUPS).flat()

/**
 * Aufgelöste Version eines Pakets — best effort. Erst direkter package.json-Import;
 * scheitert der (viele Pakete sperren ./package.json via "exports"), wird vom
 * aufgelösten Entry nach oben bis zur passenden package.json gelaufen.
 */
export function pkgVersion(name: string): string {
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

// --- npm-Registry: neueste Version + Aktualitäts-Vergleich -------------------

// Erfolgreiche Lookups 1 h cachen (Fehler werden NICHT gecacht → nächster
// Refresh versucht es erneut). Lebt im Modul-Scope über Requests hinweg.
const latestCache = new Map<string, { value: string, at: number }>()
const LATEST_TTL_MS = 60 * 60 * 1000

/** Neueste Stable-Version eines Pakets von der npm-Registry — best effort. */
export async function latestVersion(name: string): Promise<string | null> {
  const cached = latestCache.get(name)
  if (cached && Date.now() - cached.at < LATEST_TTL_MS) return cached.value
  try {
    // Kein abbreviated-Accept-Header: der liefert beim /latest-Endpoint für
    // scoped Pakete (@scope/name) einen leeren Body. Plain JSON funktioniert für beide.
    const res = await $fetch<{ version?: string }>(`https://registry.npmjs.org/${name}/latest`, {
      timeout: 4000,
    })
    const value = res.version ?? null
    if (value) latestCache.set(name, { value, at: Date.now() })
    return value
  }
  catch {
    return null
  }
}

// Neueste stabile Appwrite-Serverversion vom GitHub-Release (eigener Cache).
const appwriteCache = new Map<string, { value: string, at: number }>()

export async function latestAppwriteVersion(): Promise<string | null> {
  const cached = appwriteCache.get('appwrite')
  if (cached && Date.now() - cached.at < LATEST_TTL_MS) return cached.value
  try {
    // GitHub verlangt einen User-Agent; releases/latest = neuestes Nicht-Prerelease.
    const res = await $fetch<{ tag_name?: string }>('https://api.github.com/repos/appwrite/appwrite/releases/latest', {
      timeout: 4000,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'maui-monorepo' },
    })
    const value = res.tag_name?.replace(/^v/, '') ?? null
    if (value) appwriteCache.set('appwrite', { value, at: Date.now() })
    return value
  }
  catch {
    return null
  }
}

export function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** true = installiert < latest (veraltet), false = aktuell/voraus, null = unbestimmbar */
export function isOutdated(installed: string, latest: string | null): boolean | null {
  if (!latest) return null
  const a = parseSemver(installed)
  const b = parseSemver(latest)
  if (!a || !b) return null
  // Destrukturieren statt Index-Zugriff (sauber unter noUncheckedIndexedAccess)
  const [aMajor, aMinor, aPatch] = a
  const [bMajor, bMinor, bPatch] = b
  if (aMajor !== bMajor) return aMajor < bMajor
  if (aMinor !== bMinor) return aMinor < bMinor
  return aPatch < bPatch
}
