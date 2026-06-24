import { formatDate } from '../utils/format'

/**
 * formatDate, gebunden an die aktive i18n-Sprache (BCP-47-Tag aus der Locale-
 * Config, z.B. de-DE / en-US). Die Util bleibt context-frei und unit-testbar —
 * die Locale-Auflösung passiert nur hier im Nuxt-Context. Ohne Bindung sähen
 * EN-User sonst deutsche dd.MM.yyyy-Daten.
 */
export function useFormatDate() {
  const { locale, locales } = useI18n()

  const language = computed(() => {
    const entries = locales.value as Array<{ code: string, language?: string }>
    return entries.find(entry => entry.code === locale.value)?.language ?? locale.value
  })

  return {
    formatDate: (value: Date | string | number) => formatDate(value, language.value),
  }
}
