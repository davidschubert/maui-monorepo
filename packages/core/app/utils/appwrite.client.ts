import { Client, Realtime } from 'appwrite'

/**
 * Web SDK im Browser: NUR Realtime. CRUD läuft ausschließlich über
 * server/api/* (SessionClient) — nie aus <script setup> gegen Appwrite.
 * Dank Cookie a_session_<PROJECT_ID> auf derselben Root-Domain läuft
 * Realtime authentifiziert (Konzept A3).
 */
let cached: { client: Client, realtime: Realtime } | null = null

export function useAppwriteClient() {
  if (import.meta.server) {
    throw new Error('useAppwriteClient ist client-only — im SSR-Kontext nicht aufrufen (Guard via import.meta.server)')
  }

  if (cached) return cached

  const config = useRuntimeConfig()
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint)
    .setProject(config.public.appwriteProjectId)

  cached = { client, realtime: new Realtime(client) }
  return cached
}
