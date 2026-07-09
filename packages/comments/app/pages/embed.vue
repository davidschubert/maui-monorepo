<script setup lang="ts">
import { z } from 'zod'

/**
 * iframe-Embed-Seite (Embed-Plan E1-6): rendert CommentSection für ein
 * targetId/targetType aus den Query-Params — geladen von public/embed.js auf
 * Drittseiten. Read-only für Gäste (Schreiben erfordert Login, E2).
 * noindex (sonst indexiert Google nackte Widget-Seiten), transparenter
 * Hintergrund, Höhe per postMessage an den Loader (targetOrigin = Host-Origin
 * aus dem url-Param). Presence bleibt für Gäste ohnehin stumm.
 */
definePageMeta({ layout: 'embed' })

const appConfig = useAppConfig() as {
  maui?: { comments?: { embed?: { enabled?: boolean } } }
  ui: { colors: { primary: string } }
}
// Gate: Feature aus → 404 (kein Hinweis, dass die Route existiert)
if (!appConfig.maui?.comments?.embed?.enabled) {
  throw createError({ status: 404, statusText: 'Not Found' })
}

// Whitelist statt freiem CSS — kein Injection-Vektor (Embed-Plan § 3e)
const PRIMARY_COLORS = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'] as const

const paramsSchema = z.object({
  // Formatgrenzen wie commentSchema (targetId ≤ 255, targetType ≤ 64)
  targetId: z.string().min(1).max(255),
  targetType: z.string().min(1).max(64),
  /** URL der Hostseite — nur fürs postMessage-targetOrigin, nie gerendert */
  url: z.string().max(2000).optional(),
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  primary: z.enum(PRIMARY_COLORS).optional(),
})
const parsed = paramsSchema.safeParse(useRoute().query)
if (!parsed.success) {
  throw createError({ status: 400, statusText: 'Invalid embed parameters' })
}
const params = parsed.data

useSeoMeta({ robots: 'noindex, nofollow' })
// Transparent NUR bei theme=auto: dort folgen Host und Widget demselben
// prefers-color-scheme → Kontrast passt immer. Bei explizitem light/dark
// behält das Widget seinen eigenen Hintergrund (bg-default), sonst steht
// z. B. dunkle Schrift eines dark-Widgets auf heller Hostseite.
if (!params.theme || params.theme === 'auto') {
  useHead({
    style: [{ innerHTML: 'html,body{background:transparent!important}' }],
  })
}

// Theme: explizites light/dark schlägt auto (auto = prefers-color-scheme,
// wirkt im iframe identisch zur Hostseite — kein Handshake nötig)
const colorMode = useColorMode()
if (params.theme && params.theme !== 'auto') {
  colorMode.preference = params.theme
}
if (params.primary) {
  appConfig.ui.colors.primary = params.primary
}

// Host-Origin für strikte postMessage-Ziele; ohne validen url-Param bleibt
// '*' — es verlässt nur eine Zahl (Höhe) das iframe, nie Inhalte.
const hostOrigin = (() => {
  try {
    return params.url ? new URL(params.url).origin : '*'
  }
  catch {
    return '*'
  }
})()

onMounted(() => {
  const post = () => {
    window.parent?.postMessage(
      { type: 'maui:resize', height: document.documentElement.scrollHeight },
      hostOrigin,
    )
  }
  const observer = new ResizeObserver(post)
  observer.observe(document.body)
  post()

  // Loader-API: Hostseite kann das Theme nachsteuern (maui:set-theme)
  const onMessage = (event: MessageEvent) => {
    if (hostOrigin !== '*' && event.origin !== hostOrigin) return
    const data = event.data as { type?: string, theme?: string } | null
    if (data?.type === 'maui:set-theme' && (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system')) {
      colorMode.preference = data.theme
    }
  }
  window.addEventListener('message', onMessage)

  onScopeDispose(() => {
    observer.disconnect()
    window.removeEventListener('message', onMessage)
  })
})
</script>

<template>
  <CommentSection
    :target-id="params.targetId"
    :target-type="params.targetType"
    :target-url="$route.fullPath"
  />
</template>
