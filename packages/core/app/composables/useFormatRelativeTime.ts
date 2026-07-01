import { formatRelativeTime } from '../utils/format'

// Ein einziger „now"-Ticker pro Tab (Modul-Flag verhindert N Intervalle).
let tickerStarted = false

/**
 * formatRelativeTime, gebunden an die aktive i18n-Sprache (BCP-47-Tag aus der
 * Locale-Config, z.B. de-DE / en-US). Die Util bleibt context-frei und
 * unit-testbar — die Locale-Auflösung passiert nur hier im Nuxt-Context.
 *
 * Hydration-sicher: die „now"-Basis kommt aus useState — auf dem Server gesetzt
 * und per Payload zum Client übertragen, sodass SSR und die erste Client-Render
 * IDENTISCH sind (kein Hydration-Mismatch bei „vor X Sekunden"). Erst NACH dem
 * Mount wird sie auf die Client-Zeit gesetzt und läuft per Intervall weiter,
 * damit relative Zeiten aktualisieren.
 */
export function useFormatRelativeTime() {
  const { locale, locales } = useI18n()

  const language = computed(() => {
    const entries = locales.value as Array<{ code: string, language?: string }>
    return entries.find(entry => entry.code === locale.value)?.language ?? locale.value
  })

  const now = useState('maui:rel-now', () => Date.now())
  onMounted(() => {
    if (tickerStarted) return
    tickerStarted = true
    now.value = Date.now()
    setInterval(() => { now.value = Date.now() }, 30_000)
  })

  return {
    formatRelativeTime: (value: Date | string | number, options: { now?: Date } = {}) =>
      formatRelativeTime(value, { now: new Date(now.value), locale: language.value, ...options }),
  }
}
