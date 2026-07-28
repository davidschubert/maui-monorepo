import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { toOnlinePresences, PRESENCE_FRESH_MS, type OnlinePresence, type RawServerPresence } from './presenceFilter'

export type { OnlinePresence }

/**
 * Alle aktuell anwesenden User über die Appwrite **Presences API** (self-hostbar
 * seit 1.9.5). Recency-Filter, Mandanten-Filter + metadata-Mapping stecken in
 * der reinen (getesteten) `toOnlinePresences`. Degradiert auf []. Explizites
 * Limit statt Default 25.
 *
 * Die Presences-API kennt kein tenantId-Prädikat (die metadata ist ein
 * JSON-Blob) — es wird also pool-weit gelesen und HIER auf den Mandanten des
 * Requests eingeengt. Restrisiko: s. Kommentar in api/presence/heartbeat.post.ts.
 */
export async function listOnlinePresences(event: H3Event): Promise<OnlinePresence[]> {
  const tenant = useTenant(event)
  const expectedTenantId = tenant?.mode === 'pool' ? tenant.tenantId : undefined
  try {
    const { presences } = createAdminClient(event)
    // Seitenweise bis zur Erschöpfung (Cap 1000 als Notanker) — ein einzelnes
    // 200er-Fenster würde bei vielen gleichzeitigen Usern Anwesende verschlucken.
    // total wird nicht genutzt → nicht berechnen lassen (Mikro-Optimierung).
    const PAGE = 200
    const all: RawServerPresence[] = []
    for (let offset = 0; offset < 1000; offset += PAGE) {
      const res = await presences.list({ queries: [Query.limit(PAGE), Query.offset(offset)], total: false })
      const batch = (res.presences ?? []) as unknown as RawServerPresence[]
      all.push(...batch)
      if (batch.length < PAGE) break
    }
    return toOnlinePresences(all, Date.now(), PRESENCE_FRESH_MS, expectedTenantId)
  }
  catch {
    return []
  }
}
