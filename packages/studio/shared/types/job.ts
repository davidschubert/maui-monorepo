import type { Models } from 'node-appwrite'
import type { ManifestText } from '../../../core/shared/types/manifest'

/**
 * Provisionierungs-Jobs (M6-T2) — eng typisierter Vertrag zwischen Studio-UI
 * und dem Job-Runner (`pnpm studio:jobs`), Vorstufe des Provisioner-Vertrags
 * (Strategie § 8): Der Web-Prozess BESCHREIBT den Auftrag nur (Row in
 * `provisioning_jobs`); ausgeführt wird er repo-seitig vom Runner, der
 * Console-Credentials + Migrations-Keys hält. In M7 übernimmt der getrennte
 * Provisioner-Worker denselben Vertrag.
 */

export const JOB_TYPES = ['site.create'] as const
export type JobType = (typeof JOB_TYPES)[number]

export const JOB_STATUSES = ['queued', 'running', 'done', 'error'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

/** Payload für `site.create` — gespiegelt an den create-site-CLI-Args. */
export interface SiteCreateJobPayload {
  /** App-/Site-Name (= Ordner apps/<name>, Slug, Projekt-ID-Präfix). */
  name: string
  /** Gewählte optionale Features (core + system sind implizit). */
  features: string[]
  /** Optionaler fester Port (sonst nächster freier 30xx). */
  port?: number
}

/** Ergebnis eines erfolgreichen site.create-Jobs (JSON in `result`). */
export interface SiteCreateJobResult {
  projectId: string
  port: number
  appUrl: string
  siteRowId: string
}

/** Row-Typ zur `provisioning_jobs`-Table (Schema: Migration studio-002). */
export interface JobRow extends Models.Row {
  type: JobType
  /** JSON-kodierter Payload (typisiert je JobType, z. B. SiteCreateJobPayload). */
  payload: string
  status: JobStatus
  /** Runner-Output (stdout+stderr, auf Zeilenbudget gekürzt — Tail gewinnt). */
  log: string
  /** JSON-kodiertes Ergebnis (z. B. SiteCreateJobResult) — leer bis done. */
  result: string
  /** Studio-User, der den Job angelegt hat. */
  requestedBy: string
  /** Kennung des ausführenden Runners (Host + PID). */
  runnerId: string
  startedAt: string | null
  finishedAt: string | null
}

export const JOBS_TABLE = 'provisioning_jobs'

/**
 * Feature-Katalog (F7-Vorstufe): repo-seitige Wahrheit (feature.manifest.ts
 * aller Layer), vom Runner in die Table `feature_catalog` gesynct — der
 * Web-Prozess introspiziert das Repo NIE selbst (§ 8). rowId = Feature-Key.
 */
export interface FeatureCatalogRow extends Models.Row {
  tier: 'foundation' | 'optional'
  /** JSON-Array der Feature-Keys, die dieses Feature voraussetzt. */
  requires: string
  hasMigrations: boolean
  /** JSON-kodierte ManifestText ({en, de}). */
  title: string
  description: string
  icon: string
  syncedAt: string
}

/** Client-seitig entpackte Katalog-Zeile (GET /api/studio/features). */
export interface FeatureCatalogEntry {
  key: string
  tier: 'foundation' | 'optional'
  requires: string[]
  hasMigrations: boolean
  title: ManifestText
  description: ManifestText
  icon: string
}

export const FEATURE_CATALOG_TABLE = 'feature_catalog'
