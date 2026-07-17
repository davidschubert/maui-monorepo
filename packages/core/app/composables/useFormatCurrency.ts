import { formatCurrency } from '../utils/format'

/**
 * formatCurrency, gebunden an die aktive i18n-Sprache (wie useFormatDate) —
 * die Util bleibt context-frei und unit-testbar, die Locale-Auflösung passiert
 * nur hier. Ohne Bindung sähen EN-User deutsche 1.234,56-€-Formatierung.
 */
export function useFormatCurrency() {
  const { locale, locales } = useI18n()

  const language = computed(() => {
    const entries = locales.value as Array<{ code: string, language?: string }>
    return entries.find(entry => entry.code === locale.value)?.language ?? locale.value
  })

  return {
    formatCurrency: (value: number, options: { currency?: string } = {}) =>
      formatCurrency(value, { ...options, locale: language.value }),
  }
}
