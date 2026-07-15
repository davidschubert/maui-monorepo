import type { Models } from 'node-appwrite'

/**
 * Row-Typ zur `activities`-Table (Schema: system-Migration 014, Writes über
 * den Core-Vertrag recordActivity()). Bewusst lokal definiert statt aus dem
 * Vertrag importiert — Layer definieren ihre Row-Typen selbst (Muster wie
 * der system-GDPR-Contributor).
 */
export interface Activity extends Models.Row {
  actorId: string
  actorName: string
  /** Ereignis-Typ, z. B. 'comment.created' — UI übersetzt via activity.types.<type> */
  type: string
  objectType: string
  objectId: string
  link: string
  /** JSON-String mit kleinen Zusatzdaten für den i18n-Text (z. B. snippet) */
  metadata: string
  /** v1 immer 'members' ('public' reserviert, v2) */
  visibility: string
}

/** Listen-Eintrag, um den Actor-Avatar angereichert (wie comments) */
export interface ActivityEntry extends Activity {
  actorAvatarUrl?: string
}

export interface ActivityListResponse {
  rows: ActivityEntry[]
  /** $id der letzten Row der Seite — null, wenn keine weitere Seite existiert */
  nextCursor: string | null
}

export const ACTIVITIES_TABLE = 'activities'
