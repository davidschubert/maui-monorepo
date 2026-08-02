import { describe, expect, it } from 'vitest'
import {
  MODERATOR_LABEL_PREFIX,
  communityModeratorLabel,
  isCommunityModeratorLabel,
} from '../shared/communityModeratorLabel'

/**
 * Moderations-Audit Befund 1 — das abgeleitete Moderations-Label.
 *
 * Warum es geprüft wird: der Wert steht in den Row-Permissions JEDER Meldung
 * und im Label-Array JEDES Moderators. Weichen die beiden Seiten auch nur um
 * ein Zeichen ab, sieht niemand mehr etwas — und zwar still.
 */
describe('communityModeratorLabel', () => {
  it('leitet aus der communityId ab (Präfix + Id)', () => {
    expect(communityModeratorLabel('siteAAA')).toBe(`${MODERATOR_LABEL_PREFIX}siteAAA`)
  })

  it('zwei Communities bekommen VERSCHIEDENE Labels (das ist der ganze Punkt)', () => {
    expect(communityModeratorLabel('siteAAA')).not.toBe(communityModeratorLabel('siteBBB'))
  })

  it('kann nie das MITGLIEDER-Label einer anderen Community sein', () => {
    // Das Moderations-Label trägt immer das Präfix; eine communityId ist
    // alphanumerisch und wird von grantCommunityLabel unverändert vergeben.
    const label = communityModeratorLabel('siteAAA')
    expect(label).not.toBe('siteAAA')
    expect(label?.startsWith(MODERATOR_LABEL_PREFIX)).toBe(true)
  })

  it('ohne communityId gibt es KEINS — fail-closed, nie ein weiteres Publikum', () => {
    expect(communityModeratorLabel(null)).toBeNull()
    expect(communityModeratorLabel(undefined)).toBeNull()
    expect(communityModeratorLabel('')).toBeNull()
  })

  it('nicht-alphanumerische Ids werden abgewiesen (Appwrite akzeptiert sie nicht)', () => {
    expect(communityModeratorLabel('site-aaa')).toBeNull()
    expect(communityModeratorLabel('site.aaa')).toBeNull()
    expect(communityModeratorLabel('site aaa')).toBeNull()
  })

  it('zu lange Ids ergeben KEIN Label statt eines abgeschnittenen', () => {
    // 34 Zeichen + 'mod' = 37 > 36. Ein gekürztes Label wäre die schlimmste
    // Variante: zwei Communities könnten dasselbe bekommen.
    expect(communityModeratorLabel('a'.repeat(34))).toBeNull()
    // Die reale Länge (ID.unique() = 20) passt bequem.
    expect(communityModeratorLabel('a'.repeat(20))).toHaveLength(23)
    // Genau an der Grenze (33 + 3 = 36) geht es noch.
    expect(communityModeratorLabel('a'.repeat(33))).toHaveLength(36)
  })

  it('erkennt seine eigenen Labels wieder (Aufräum-Pfade)', () => {
    expect(isCommunityModeratorLabel('modsiteAAA')).toBe(true)
    expect(isCommunityModeratorLabel('siteAAA')).toBe(false)
    expect(isCommunityModeratorLabel(MODERATOR_LABEL_PREFIX)).toBe(false)
  })
})
