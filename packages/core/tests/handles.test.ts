import { describe, expect, it } from 'vitest'
import {
  HANDLE_CHANGE_INTERVAL_MS,
  HANDLE_FALLBACK_BASE,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  RESERVED_HANDLES,
  handleCandidate,
  handleChangeAvailableAt,
  handleRejection,
  isValidHandle,
  mayChangeHandleAt,
  normalizeHandle,
  suggestHandleBase,
} from '../shared/handles'

describe('normalizeHandle', () => {
  it('nimmt @ und Leerraum weg und schreibt klein', () => {
    expect(normalizeHandle('  @DavidSchubert ')).toBe('davidschubert')
  })

  it('nimmt auch mehrere führende @ weg', () => {
    expect(normalizeHandle('@@david')).toBe('david')
  })

  it('biegt nichts anderes zurecht — Ungültiges bleibt ungültig', () => {
    expect(normalizeHandle('David Schubert!')).toBe('david schubert!')
  })
})

describe('handleRejection', () => {
  it('nimmt gewöhnliche Handles an', () => {
    for (const value of ['david', 'david2', 'erika_muster', 'a1b', '007']) {
      expect(handleRejection(value), value).toBeNull()
    }
  })

  it('vergleicht IMMER die normalisierte Form', () => {
    expect(handleRejection('@DavidSchubert')).toBeNull()
    // Grossgeschrieben ist derselbe reservierte Name.
    expect(handleRejection('@Support')).toBe('reserved')
  })

  it('lehnt zu kurz und zu lang ab', () => {
    expect(handleRejection('ab')).toBe('too_short')
    expect(handleRejection('a'.repeat(HANDLE_MIN_LENGTH))).toBeNull()
    expect(handleRejection('a'.repeat(HANDLE_MAX_LENGTH))).toBeNull()
    expect(handleRejection('a'.repeat(HANDLE_MAX_LENGTH + 1))).toBe('too_long')
  })

  it('lehnt fremde Zeichen ab', () => {
    for (const value of ['da vid', 'david!', 'da-vid', 'da.vid', 'dävid', 'da/vid']) {
      expect(handleRejection(value), value).toBe('charset')
    }
  })

  it('lehnt Unterstriche am Rand ab (Betonungs-Nachbarschaft)', () => {
    expect(handleRejection('_david')).toBe('charset')
    expect(handleRejection('david_')).toBe('charset')
    expect(handleRejection('da_vid')).toBeNull()
  })

  it('lehnt reservierte Namen ab', () => {
    for (const value of ['admin', 'support', 'hilfe', 'pukalani', 'moderator', 'system']) {
      expect(handleRejection(value), value).toBe('reserved')
    }
  })

  it('hält die Reservierungs-Liste selbst gültig — sonst wäre ein Eintrag wirkungslos', () => {
    // Ein reservierter Name, der schon an der Gestalt scheitert, ist eine
    // Attrappe: er würde 'charset' melden und niemandem sagen, dass er
    // reserviert IST. Diese Prüfung fängt einen Tippfehler in der Liste.
    for (const value of RESERVED_HANDLES) {
      expect(normalizeHandle(value), value).toBe(value)
      expect(value.length, value).toBeGreaterThanOrEqual(HANDLE_MIN_LENGTH)
      expect(value.length, value).toBeLessThanOrEqual(HANDLE_MAX_LENGTH)
    }
  })

  it('isValidHandle ist die Kurzform', () => {
    expect(isValidHandle('@David')).toBe(true)
    expect(isValidHandle('admin')).toBe(false)
  })
})

describe('suggestHandleBase', () => {
  it('macht aus dem Anzeigenamen EIN Wort', () => {
    expect(suggestHandleBase('David Schubert')).toBe('davidschubert')
  })

  it('schreibt deutsche Umlaute aus, statt sie wegzuwerfen', () => {
    expect(suggestHandleBase('Jürgen Groß')).toBe('juergengross')
    expect(suggestHandleBase('Änne Öl')).toBe('aenneoel')
  })

  it('fällt bei fremden Akzenten auf den Grundbuchstaben zurück', () => {
    expect(suggestHandleBase('Renée Élan')).toBe('reneeelan')
  })

  it('wirft alles weg, was nicht in den Zeichensatz gehört', () => {
    expect(suggestHandleBase('Dr. med. Anna-Lena Weiß (Praxis)')).toBe('drmedannalenaweisspraxis')
  })

  it('kürzt auf die Höchstlänge', () => {
    expect(suggestHandleBase('a'.repeat(80))).toHaveLength(HANDLE_MAX_LENGTH)
  })

  it('nimmt den Rückfall, wenn nichts Brauchbares übrig bleibt', () => {
    expect(suggestHandleBase('王小明')).toBe(HANDLE_FALLBACK_BASE)
    expect(suggestHandleBase('  ')).toBe(HANDLE_FALLBACK_BASE)
    // Zu kurz zählt auch als unbrauchbar — 'Al' würde sonst 'al' ergeben und
    // an der Mindestlänge scheitern.
    expect(suggestHandleBase('Al')).toBe(HANDLE_FALLBACK_BASE)
  })

  it('liefert IMMER etwas Gültiges — sonst bliebe die Vergabe stecken', () => {
    for (const name of ['David Schubert', 'Jürgen Groß', '王小明', 'Al', '', 'a'.repeat(80), '...']) {
      expect(isValidHandle(suggestHandleBase(name)), name).toBe(true)
    }
  })
})

describe('handleCandidate', () => {
  it('ist bei 1 die nackte Basis', () => {
    expect(handleCandidate('davidschubert', 1)).toBe('davidschubert')
  })

  it('hängt ab 2 die Ziffer an', () => {
    expect(handleCandidate('davidschubert', 2)).toBe('davidschubert2')
    expect(handleCandidate('davidschubert', 11)).toBe('davidschubert11')
  })

  it('bleibt auch bei maximal langer Basis gültig', () => {
    const base = 'a'.repeat(HANDLE_MAX_LENGTH)
    for (const index of [1, 2, 10, 100]) {
      const candidate = handleCandidate(base, index)
      expect(candidate.length, candidate).toBeLessThanOrEqual(HANDLE_MAX_LENGTH)
      expect(isValidHandle(candidate), candidate).toBe(true)
    }
  })

  it('lässt beim Abschneiden keinen Unterstrich am Ende stehen', () => {
    const base = `${'a'.repeat(HANDLE_MAX_LENGTH - 2)}_b`
    const candidate = handleCandidate(base, 2)
    expect(candidate.endsWith('_2')).toBe(false)
    expect(isValidHandle(candidate), candidate).toBe(true)
  })

  it('normalisiert die Basis mit', () => {
    expect(handleCandidate('@David', 2)).toBe('david2')
  })
})

describe('mayChangeHandleAt — die Sperrfrist ist eine Regel, kein Kommentar', () => {
  const now = Date.parse('2026-08-04T12:00:00.000Z')

  it('erlaubt die erste Änderung immer', () => {
    expect(mayChangeHandleAt(null, now)).toBe(true)
    expect(mayChangeHandleAt(undefined, now)).toBe(true)
    expect(handleChangeAvailableAt(null)).toBeNull()
  })

  it('sperrt innerhalb der Frist', () => {
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    expect(mayChangeHandleAt(yesterday, now)).toBe(false)
  })

  it('gibt genau nach der Frist wieder frei', () => {
    const justInside = new Date(now - HANDLE_CHANGE_INTERVAL_MS + 1000).toISOString()
    const exactly = new Date(now - HANDLE_CHANGE_INTERVAL_MS).toISOString()
    expect(mayChangeHandleAt(justInside, now)).toBe(false)
    expect(mayChangeHandleAt(exactly, now)).toBe(true)
  })

  it('nennt den Zeitpunkt, damit die Oberfläche ihn anzeigen kann', () => {
    const last = '2026-08-01T00:00:00.000Z'
    expect(handleChangeAvailableAt(last)).toBe(Date.parse(last) + HANDLE_CHANGE_INTERVAL_MS)
  })

  it('sperrt niemanden wegen eines unlesbaren Datums aus', () => {
    expect(mayChangeHandleAt('kein datum', now)).toBe(true)
  })
})
