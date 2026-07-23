/**
 * E2 Embed-Login — IFRAME-Seite (Embed-Plan § 3a): öffnet das Login-Popup
 * (Top-Level auf unserer Origin → voller bestehender Auth-Stack first-party),
 * empfängt das Handoff-Token per postMessage (nur von der EIGENEN Origin
 * akzeptiert) und löst es gegen das CHIPS-partitionierte Session-Cookie ein.
 *
 * `blocked` = der Browser hat das Partitioned-Cookie verworfen (kein
 * CHIPS-Support / harte Cookie-Blockade): der CTA zeigt dann den
 * Deep-Link-Fallback („auf unserer Seite kommentieren") — Lesen geht immer.
 */
export function useEmbedLogin() {
  const auth = useAuthStore()
  const localePath = useLocalePath()
  const status = ref<'idle' | 'waiting' | 'blocked'>('idle')

  async function redeem(token: string) {
    try {
      await $fetch('/api/auth/embed-session', { method: 'POST', body: { token } })
      await auth.refresh()
      status.value = auth.user ? 'idle' : 'blocked'
    }
    catch {
      status.value = 'blocked'
    }
  }

  function onMessage(event: MessageEvent) {
    // Token kommt NUR vom Popup unserer eigenen Origin — alles andere ignorieren
    if (event.origin !== window.location.origin) return
    const data = event.data as { type?: string, token?: string } | null
    if (data?.type !== 'maui:embed-login' || typeof data.token !== 'string') return
    void redeem(data.token)
  }

  function openLoginPopup() {
    status.value = 'waiting'
    window.open(`${localePath('/login')}?embed=1`, 'maui-embed-login', 'popup,width=480,height=680')
  }

  onMounted(() => { window.addEventListener('message', onMessage) })
  onUnmounted(() => { window.removeEventListener('message', onMessage) })

  return { status, openLoginPopup }
}
