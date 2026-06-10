import { Client, Realtime } from 'appwrite'

/**
 * Web SDK im Browser: NUR Realtime — CRUD läuft ausschließlich über
 * server/api/* (SessionClient), nie aus <script setup> gegen Appwrite.
 *
 * Hinweis (06/2026): useRealtimeRows nutzt aktuell einen nativen
 * WebSocket-Client statt dieses SDKs, weil das neue SDK-Realtime-Protokoll
 * Appwrite ≥1.9.5 voraussetzt (Cloud-only). Sobald self-hosted nachzieht,
 * wandert das Composable auf realtime.subscribe() zurück.
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
