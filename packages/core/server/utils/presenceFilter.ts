/**
 * Reine (Nuxt-freie) Presence-Logik — testbar ohne Server-Kontext.
 * `toOnlinePresences` filtert eine rohe Presences-Liste auf „online jetzt"
 * (Aktualität < freshMs) UND auf den erwarteten Mandanten, und mappt die
 * metadata auf ein sicheres Shape.
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

/**
 * Mandanten-Filter (Audit B1). Im Pool teilen sich ALLE Communities ein
 * Appwrite-Projekt und damit EINEN Presences-Raum — ohne diesen Vergleich sähe
 * ein Mitglied von Kunde A die Namen aller gerade online befindlichen User
 * ALLER Kunden.
 *
 * Strikte Gleichheit in BEIDE Richtungen (fail-closed): eine Presence OHNE
 * tenantId gehört nicht auf einen Mandanten-Host (Alt-Presence, fremdes
 * Deployment), eine MIT tenantId nicht auf einen Kontroll-Host oder in eine
 * Silo-App. Kein „unbekannt = passt schon".
 *
 * `expectedTenantId` fehlt/undefined = Silo/Single-Tenant → es passen genau die
 * Presencen ohne tenantId, also das heutige Verhalten.
 */
function belongsToTenant(meta: Record<string, unknown>, expectedTenantId?: string | null): boolean {
  const actual = typeof meta.tenantId === 'string' ? meta.tenantId : ''
  return actual === (expectedTenantId ?? '')
}

export function toOnlinePresences(
  raw: RawServerPresence[],
  now: number,
  freshMs: number = PRESENCE_FRESH_MS,
  expectedTenantId?: string | null,
): OnlinePresence[] {
  return raw
    .filter(p => now - Date.parse(p.$updatedAt) < freshMs)
    .filter(p => belongsToTenant((p.metadata ?? {}) as Record<string, unknown>, expectedTenantId))
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
