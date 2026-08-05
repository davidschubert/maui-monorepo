import { describe, expect, it } from 'vitest'
import {
  TRUST_LEVELS,
  TRUST_LEVEL_CAPABILITIES,
  trustLevelGrantsCapability,
  trustLevelHasCapability,
} from '../../core/shared/trustLevel'
import { COMMUNITY_ROLE_CAPABILITIES, COMMUNITY_ROLES } from '../../core/shared/communityAuthz'

/**
 * DAS TL1-GATE — UND DIE SICHERHEITSZUSAGE, DIE DARAN HÄNGT.
 *
 * ═══ WARUM DIESER TEST DER WICHTIGSTE DES LAYERS IST ══════════════════════
 * Eine private Nachricht wird über die Datentür geschrieben, und die löst den
 * A5-Beitritt aus (`actorJoinsByWriting('member')`). Das ist nur deshalb
 * ungefährlich, weil senden darf, wer LÄNGST Mitglied ist — TL1 verlangt zwei
 * Tage Mitgliedschaft, einen eigenen Inhalt und eine vergebene Zustimmung.
 *
 * Stünde `messages.write` je bei Stufe 0, wäre der Auslöser kein No-op mehr:
 * ein Fremder könnte sich durch das Anschreiben EINES Mitglieds das
 * `Role.label(<communityId>)` verschaffen — und damit den Lesezugriff auf ALLE
 * mitglieder-internen Inhalte einer geschlossenen Community. Die private
 * Nachricht wäre der Schlüssel zur Haustür (Konzept § 3).
 *
 * Dieser Test ist der Nagel dafür. Wer ihn rot macht, ändert nicht einen Wert,
 * sondern eine Zusage.
 */
describe('messages.write hängt an Stufe 1', () => {
  it('steht NIE bei Stufe 0', () => {
    expect(trustLevelHasCapability(0, 'messages.write')).toBe(false)
    expect(TRUST_LEVEL_CAPABILITIES[0]).not.toContain('messages.write')
  })

  it('steht ab Stufe 1 bei JEDER höheren Stufe', () => {
    for (const level of TRUST_LEVELS) {
      if (level === 0) continue
      expect(trustLevelHasCapability(level, 'messages.write'), `Stufe ${level}`).toBe(true)
    }
  })

  it('ist überhaupt aus einer Stufe erreichbar', () => {
    // Ohne diese Aussage fragte `requireCommunityPermission` die Stufe gar
    // nicht erst ab (`trustLevelGrantsCapability` ist der Spar-Filter) — das
    // Gate wäre dann still wirkungslos für jeden ohne Rolle.
    expect(trustLevelGrantsCapability('messages.write')).toBe(true)
  })
})

/**
 * DIE ZWEITE HÄLFTE DER ZUSAGE liegt bewusst NICHT hier: dass Stufe 1
 * zwei Tage Mitgliedschaft, einen eigenen Inhalt und eine vergebene
 * Zustimmung verlangt (und dass eine UNBEKANNTE Zugehörigkeit als NICHT
 * erfüllt gilt), prüft `packages/posts/tests/trustLevels.test.ts` an der
 * Regel, der sie gehört. Ein Import von dort wäre eine Produkt-zu-Produkt-
 * Abhängigkeit (A14) — und eine Kopie der Zahlen hier wäre eine zweite
 * Wahrheit, die beim nächsten Umstellen zurückbliebe.
 */
describe('Rollen', () => {
  it('gibt dem VIEWER kein Senderecht', () => {
    // Der Viewer ist genau die Rolle, die ein automatischer Beitritt vergibt
    // (A5). Hätte er das Recht, wäre das TL1-Gate eine Zierde und die
    // A5-Zusage oben hinfällig.
    expect(COMMUNITY_ROLE_CAPABILITIES.viewer).not.toContain('messages.write')
  })

  it('gibt es den ERNANNTEN Rollen', () => {
    // Eine Ernennung durch den Owner ist eine stärkere Vertrauensaussage als
    // zwei Tage Mitgliedschaft.
    for (const role of ['editor', 'moderator', 'admin', 'owner'] as const) {
      expect(COMMUNITY_ROLE_CAPABILITIES[role], role).toContain('messages.write')
    }
  })

  it('gibt den Owner-Schalter AUSSCHLIESSLICH dem Owner', () => {
    for (const role of COMMUNITY_ROLES) {
      expect(COMMUNITY_ROLE_CAPABILITIES[role].includes('messages.manage'), role).toBe(role === 'owner')
    }
  })

  it('vergibt den Owner-Schalter über KEINE Vertrauensstufe', () => {
    // Ein Mitglied, das sich den privaten Kanal selbst aufschließt, wäre die
    // Umkehrung von Davids Entscheidung 4.
    expect(trustLevelGrantsCapability('messages.manage')).toBe(false)
  })
})
