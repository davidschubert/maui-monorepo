import { describe, it, expect } from 'vitest'
import { formatDate, formatCurrency } from '../app/utils/format'
import { useFormatDate } from '../app/composables/useFormatDate'
import { useFormatCurrency } from '../app/composables/useFormatCurrency'

/** Intl setzt vor dem Währungssymbol ein geschütztes Leerzeichen (U+00A0) */
function normalize(value: string): string {
  return value.replace(/\u00A0/g, ' ')
}

describe('formatDate', () => {
  it('formatiert Date-only-Strings als dd.MM.yyyy', () => {
    expect(formatDate('2026-01-01')).toBe('01.01.2026')
  })

  it('kippt am Monatswechsel nicht auf den Vortag (Timezone-sicher)', () => {
    expect(formatDate('2026-03-01')).toBe('01.03.2026')
    expect(formatDate('2025-12-31')).toBe('31.12.2025')
  })

  it('formatiert Date-Objekte', () => {
    expect(formatDate(new Date(2026, 5, 10))).toBe('10.06.2026')
  })

  it('formatiert Timestamps', () => {
    expect(formatDate(new Date(2026, 0, 31).getTime())).toBe('31.01.2026')
  })

  it('unterstützt andere Locales', () => {
    expect(formatDate('2026-01-01', 'en-US')).toBe('01/01/2026')
  })
})

describe('formatCurrency', () => {
  it('formatiert Beträge als 1.234,56 €', () => {
    expect(normalize(formatCurrency(1234.56))).toBe('1.234,56 €')
  })

  it('formatiert 0-Beträge', () => {
    expect(normalize(formatCurrency(0))).toBe('0,00 €')
  })

  it('formatiert negative Beträge', () => {
    expect(normalize(formatCurrency(-1234.56))).toBe('-1.234,56 €')
  })

  it('rundet auf zwei Nachkommastellen', () => {
    expect(normalize(formatCurrency(9.999))).toBe('10,00 €')
  })

  it('unterstützt andere Währungen', () => {
    expect(normalize(formatCurrency(1234.56, { currency: 'USD' }))).toContain('$')
  })
})

describe('useFormatDate / useFormatCurrency', () => {
  it('liefern die Formatierungs-Funktionen', () => {
    expect(useFormatDate().formatDate('2026-01-01')).toBe('01.01.2026')
    expect(normalize(useFormatCurrency().formatCurrency(1234.56))).toBe('1.234,56 €')
  })
})
