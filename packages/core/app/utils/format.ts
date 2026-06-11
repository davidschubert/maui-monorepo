/**
 * Reine Formatierungs-Funktionen (kein Browser, kein Nuxt-Context) —
 * direkt unit-testbar, DACH-Defaults.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** dd.MM.yyyy — z.B. 01.01.2026 */
export function formatDate(value: Date | string | number, locale = 'de-DE'): string {
  let date: Date

  if (value instanceof Date) {
    date = value
  }
  else if (typeof value === 'string' && DATE_ONLY.test(value)) {
    // Date-only Strings als LOKALES Datum parsen — new Date('2026-01-01')
    // wäre UTC-Mitternacht und kippt je nach Zeitzone auf den Vortag
    const [, year, month, day] = DATE_ONLY.exec(value)!
    date = new Date(Number(year), Number(month) - 1, Number(day))
  }
  else {
    date = new Date(value)
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/** "vor 5 Minuten" / "gestern" — now ist injizierbar (Testbarkeit) */
export function formatRelativeTime(
  value: Date | string | number,
  options: { locale?: string, now?: Date } = {},
): string {
  const date = value instanceof Date ? value : new Date(value)
  const now = options.now ?? new Date()
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(options.locale ?? 'de-DE', { numeric: 'auto' })

  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) >= seconds) {
      return formatter.format(Math.trunc(diffSeconds / seconds), unit)
    }
  }
  return formatter.format(diffSeconds, 'second')
}

/** 1.234,56 € — Intl nutzt ein geschütztes Leerzeichen vor dem Symbol */
export function formatCurrency(
  value: number,
  options: { locale?: string, currency?: string } = {},
): string {
  return new Intl.NumberFormat(options.locale ?? 'de-DE', {
    style: 'currency',
    currency: options.currency ?? 'EUR',
  }).format(value)
}
