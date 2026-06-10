/**
 * Hydratisiert den Auth-Store aus dem h3-Context (server/middleware/auth.ts) —
 * kein zusätzlicher Client-Fetch beim App-Start, der State kommt im Payload mit.
 */
export default defineNuxtPlugin(() => {
  const event = useRequestEvent()

  if (event?.context.user) {
    useAuthStore().setUser(event.context.user)
  }
})
