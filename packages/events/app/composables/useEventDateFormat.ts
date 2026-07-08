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

  /** Kurz-Monat für Datum-Blöcke (AUG/MÄR) — locale-stabil, kein Hydration-Drift */
  const formatMonthShort = (iso: string) => new Intl.DateTimeFormat(language.value, {
    month: 'short',
  }).format(new Date(iso))

  /** gleicher Kalendertag? → Ende nur als Uhrzeit anzeigen */
  const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString()

  /**
   * Datums-Zeile für Cards: eintägig „Fr., 15.08.2026, 18:00" —
   * MEHRTÄGIG als Spanne „Do., 20.08. – Sa., 22.08.2026" (die Reihe muss
   * als Reihe erkennbar sein, nicht nur der erste Tag).
   */
  const formatDateSpan = (startAt: string, endAt: string | null) => {
    if (!endAt || sameDay(startAt, endAt)) return formatDateTime(startAt)
    const startFmt = new Intl.DateTimeFormat(language.value, { weekday: 'short', day: '2-digit', month: '2-digit' })
    const endFmt = new Intl.DateTimeFormat(language.value, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
    return `${startFmt.format(new Date(startAt))} – ${endFmt.format(new Date(endAt))}`
  }

  /** mehrtägig? (Card-/Detail-Badge „Mehrtägig") */
  const isMultiDay = (startAt: string, endAt: string | null) => !!endAt && !sameDay(startAt, endAt)

  return { formatDateTime, formatTime, formatMonthShort, formatDateSpan, isMultiDay, sameDay }
}
