/**
 * Dev-Tool: subscribed auf den comments-Realtime-Channel und loggt Events.
 *
 *   node --env-file=apps/<app>/.env packages/comments/scripts/realtime-probe.ts
 *
 * Nutzt das Legacy-URL-Protokoll (channels[] in der Connect-URL) wie
 * useRealtimeRows im Core — das neue SDK-Protokoll braucht Appwrite ≥1.9.5,
 * das es self-hosted noch nicht gibt (Cloud-first Rollout).
 * Beendet sich nach PROBE_TIMEOUT ms (Default 25s).
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

if (!endpoint || !projectId || !databaseId) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/<app>/.env aufrufen.')
  process.exit(1)
}

const channel = `tablesdb.${databaseId}.tables.comments.rows`
const url = `${endpoint.replace(/^http/, 'ws')}/realtime?project=${encodeURIComponent(projectId)}&channels[]=${encodeURIComponent(channel)}`

const socket = new WebSocket(url)

socket.onopen = () => console.log(`[probe] subscribed: ${channel}`)
socket.onmessage = (event) => {
  const message = JSON.parse(String(event.data))
  if (message.type !== 'event') return
  console.log(`[realtime] ${message.data.events[0]}`)
  console.log(`[payload]  ${JSON.stringify(message.data.payload)}`)
}
socket.onclose = () => console.log('[probe] connection closed')

setTimeout(() => {
  console.log('[probe] timeout — exit')
  process.exit(0)
}, Number(process.env.PROBE_TIMEOUT ?? 25_000))
