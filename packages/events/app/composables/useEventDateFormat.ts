/**
 * Datums-/Zeitformatierung für Events, gebunden an die aktive i18n-Sprache
 * (Muster useFormatDate im Core — der braucht aber nur date-only, Events
 * brauchen Datum+Uhrzeit und reine Uhrzeit für Zeitfenster am selben Tag).
 */
export function useEventDateFormat() {
  const { locale, locales } = useI18n()

  const language = computed(() => {
    const entries = locales.value as Array<{ code: string, language?: string }>
    return entries.find(entry => entry.code === locale.value)?.language ?? locale.value
  })

  const formatDateTime = (iso: string) => new Intl.DateTimeFormat(language.value, {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

  const formatTime = (iso: string) => new Intl.DateTimeFormat(language.value, {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

  /** gleicher Kalendertag? → Ende nur als Uhrzeit anzeigen */
  const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString()

  return { formatDateTime, formatTime, sameDay }
}
