/** System-/Infrastruktur-Überblick für das Admin-Dashboard (/dashboard/system). */

export interface HealthEntry {
  name: string
  status: 'pass' | 'fail' | 'unknown'
  ping: number | null
}

export interface DependencyEntry {
  name: string
  version: string
  category: string
  /** Neueste Version laut npm-Registry; null wenn nicht ermittelbar (offline, intern, …) */
  latest?: string | null
  /** true = installierte Version < latest; false = aktuell; null = unbekannt */
  outdated?: boolean | null
}

/** Inhalts-Kategorie eines Feature-Layers (key wird im UI via i18n übersetzt). */
export interface LayerCategory {
  key: string
  count: number
  /** Datei-/Entity-Namen (ohne Endung), z.B. „UserAvatar“, „admin/users/index.get“ */
  items: string[]
}

/** Aufgeschlüsselter Inhalt eines Feature-Layers. */
export interface LayerInfo {
  name: string
  version: string
  description: string | null
  total: number
  categories: LayerCategory[]
}

export interface SystemInfo {
  generatedAt: string
  runtime: {
    node: string
    platform: string
    arch: string
    uptimeSeconds: number
    memoryRssBytes: number
    memoryHeapUsedBytes: number
    nodeEnv: string
  }
  appwrite: {
    version: string | null
    /** Neueste Appwrite-Release-Version (GitHub); null wenn nicht ermittelbar */
    latestVersion: string | null
    /** true = laufende Serverversion < latest; false = aktuell; null = unbekannt */
    outdated: boolean | null
    endpoint: string
    projectId: string
    databaseId: string
    timeDiffMs: number | null
    health: HealthEntry[]
  }
  server: {
    hostname: string
    ipAddresses: string[]
  }
  app: {
    name: string
    version: string
    url: string
    avatarsBucket: string | null
  }
  layers: LayerInfo[]
  dependencies: DependencyEntry[]
  modules: string[]
}
