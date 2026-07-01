import type { H3Event } from 'h3'

// „online jetzt" = zuletzt < 60s aktualisiert (Heartbeat hält es frisch); die
// Presence-`expiresAt` selbst ist server-seitig lang (~30 Tage).
const FRESH_MS = 60_000

export interface OnlinePresence {
  userId: string
  userName: string
  /** Was der User gerade ansieht, z.B. 'post:demo-post' */
  scope?: string
  /** Was der User gerade tut, z.B. 'reviewing:report:42' */
  action?: string
  typing: boolean
  /** Zeitpunkt der letzten Presence-Aktualisierung (ISO) — „zuletzt aktiv" */
  updatedAt: string
}

/**
 * Alle aktuell anwesenden User über die Appwrite **Presences API** (self-hostbar
 * seit 1.9.5) — abgelaufene Einträge sind server-seitig ausgefiltert. Ersetzt die
 * frühere presence-Table + manuelles Frische-/Stale-Handling. Degradiert auf [].
 */
export async function listOnlinePresences(event: H3Event): Promise<OnlinePresence[]> {
  try {
    const { presences } = createAdminClient(event)
    const res = await presences.list()
    const now = Date.now()
    return (res.presences ?? []).filter(p => now - Date.parse(p.$updatedAt) < FRESH_MS).map((p) => {
      const meta = (p.metadata ?? {}) as Record<string, unknown>
      return {
        userId: p.userId,
        userName: typeof meta.userName === 'string' ? meta.userName : '',
        scope: typeof meta.scope === 'string' ? meta.scope : undefined,
        action: typeof meta.action === 'string' ? meta.action : undefined,
        typing: meta.typing === true,
        updatedAt: p.$updatedAt,
      }
    })
  }
  catch {
    return []
  }
}
