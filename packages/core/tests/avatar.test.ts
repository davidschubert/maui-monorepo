import { describe, it, expect } from 'vitest'
import { avatarInitials } from '../app/utils/avatar'

describe('avatarInitials', () => {
  it('ignoriert Klammer-Zusätze (Audit S2: „Lena (Coach)" ergab „L(")', () => {
    expect(avatarInitials('Lena (Coach)')).toBe('L')
    expect(avatarInitials('Max [Support]')).toBe('M')
    expect(avatarInitials('Lena (Coach) Meier')).toBe('LM')
  })

  it('fällt auf den Rohnamen zurück, wenn nur Klammer-Inhalt da ist', () => {
    expect(avatarInitials('(Test)')).toBe('T')
    expect(avatarInitials('[QA]')).toBe('Q')
  })

  it('ist Unicode-fähig (CJK, Umlaute, diakritische Zeichen)', () => {
    expect(avatarInitials('李 明')).toBe('李明')
    expect(avatarInitials('Ömer Çelik')).toBe('ÖÇ')
  })

  it('nimmt bei einem Wort genau eine Initiale', () => {
    expect(avatarInitials('single')).toBe('S')
  })

  it('gibt bei leerem Namen einen leeren String zurück', () => {
    expect(avatarInitials('')).toBe('')
    expect(avatarInitials('   ')).toBe('')
    expect(avatarInitials(null)).toBe('')
    expect(avatarInitials(undefined)).toBe('')
  })

  it('überspringt Emoji- und Symbol-Präfixe', () => {
    expect(avatarInitials('🎉 Lena')).toBe('L')
    expect(avatarInitials('🎉🚀')).toBe('')
    expect(avatarInitials('★ Nina Kraus')).toBe('NK')
  })

  it('deckelt bei zwei Initialen (erste zwei Wörter)', () => {
    expect(avatarInitials('Anna Lena Müller')).toBe('AL')
  })

  it('nutzt den Fallback (z. B. E-Mail), wenn kein Name da ist', () => {
    expect(avatarInitials(null, 'max.mustermann@example.com')).toBe('MM')
    expect(avatarInitials('', 'lena@example.com')).toBe('LE')
  })
})
