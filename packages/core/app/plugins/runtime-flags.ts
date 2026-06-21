import type { AppConfig } from '../../shared/types/config'

/**
 * Initiales Befüllen der Laufzeit-Flags: serverseitig einmal /api/config holen
 * und in den useState schreiben. Über useState landet der Wert im SSR-Payload
 * und wird im Client hydratisiert — kein zweiter Fetch, kein Flash. Live-Updates
 * danach über das Plugin `realtime-config`.
 */
export default defineNuxtPlugin(async () => {
  if (!import.meta.server) return
  const flags = useRuntimeFlags()
  try {
    flags.value = await $fetch<AppConfig>('/api/config')
  }
  catch {
    // permissive Defaults beibehalten
  }
})
