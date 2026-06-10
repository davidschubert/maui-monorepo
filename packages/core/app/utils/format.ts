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
