import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { toOnlinePresences, type OnlinePresence, type RawServerPresence } from './presenceFilter'

export type { OnlinePresence }

/**
 * Alle aktuell anwesenden User über die Appwrite **Presences API** (self-hostbar
 * seit 1.9.5). Recency-Filter + metadata-Mapping steckt in der reinen (getesteten)
 * `toOnlinePresences`. Degradiert auf []. Explizites Limit statt Default 25.
 */
export async function listOnlinePresences(event: H3Event): Promise<OnlinePresence[]> {
  try {
    const { presences } = createAdminClient(event)
    // total wird nicht genutzt → nicht berechnen lassen (Mikro-Optimierung)
    const res = await presences.list({ queries: [Query.limit(200)], total: false })
    return toOnlinePresences((res.presences ?? []) as unknown as RawServerPresence[], Date.now())
  }
  catch {
    return []
  }
}
