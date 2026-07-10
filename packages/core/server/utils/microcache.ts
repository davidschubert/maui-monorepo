/**
 * Kleiner In-Memory-TTL-Cache für teure, user-agnostische GET-Antworten
 * (Microcaching, OPEN-ITEMS Idee 3). NIEMALS für Antworten mit Session-/
 * User-Daten verwenden — der Cache unterscheidet nicht nach User.
 *
 * ⚠️ In-memory wie rate-limit.ts: reicht für Single-Instanz; Multi-Instanz
 * hätte pro Instanz einen eigenen (harmlos, nur Cache-Effizienz).
 */
const MAX_ENTRIES = 500

export interface Microcache<T> {
  get: (key: string) => T | undefined
  set: (key: string, value: T) => void
  clear: () => void
}

export function createMicrocache<T>(ttlMs: number): Microcache<T> {
  const store = new Map<string, { value: T, expires: number }>()
  return {
    get(key) {
      const hit = store.get(key)
      if (hit && hit.expires > Date.now()) return hit.value
      store.delete(key)
      return undefined
    },
    set(key, value) {
      // Simpler Überlauf-Schutz statt LRU — bei 500 Keys ist Leeren billig
      if (store.size >= MAX_ENTRIES) store.clear()
      store.set(key, { value, expires: Date.now() + ttlMs })
    },
    clear() {
      store.clear()
    },
  }
}
