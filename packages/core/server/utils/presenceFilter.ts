/**
 * Reine (Nuxt-freie) Presence-Logik — testbar ohne Server-Kontext.
 * `toOnlinePresences` filtert eine rohe Presences-Liste auf „online jetzt"
 * (Aktualität < freshMs) und mappt die metadata auf ein sicheres Shape.
 */
export interface OnlinePresence {
  userId: string
  userName: string
  scope?: string
  action?: string
  typing: boolean
  /** ISO-Zeitpunkt der letzten Aktualisierung — „zuletzt aktiv" */
  updatedAt: string
}

export interface RawServerPresence {
  userId: string
  $updatedAt: string
  metadata?: Record<string, unknown> | null
}

// „online jetzt" = zuletzt < 180s aktualisiert. Großzügig, damit gedrosselte
// Hintergrund-Tabs (~1 Heartbeat/Minute, ggf. seltener) nicht flackern/rausfallen.
// Sauberes Verlassen entfernt die Presence sofort (leave-Beacon), daher unkritisch.
export const PRESENCE_FRESH_MS = 180_000

export function toOnlinePresences(
  raw: RawServerPresence[],
  now: number,
  freshMs: number = PRESENCE_FRESH_MS,
): OnlinePresence[] {
  return raw
    .filter(p => now - Date.parse(p.$updatedAt) < freshMs)
    .map((p) => {
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
