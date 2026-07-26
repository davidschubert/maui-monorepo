import { describe, expect, it } from 'vitest'
// Cross-Layer NUR im Test: der Vibe-Katalog nennt Theme-Ids des themes-Layers
// als Strings. Dieser Import beweist, dass sie dort wirklich existieren — ein
// Tippfehler wäre sonst erst als farblose Community im Browser sichtbar.
// (Zur Laufzeit gibt es diese Abhängigkeit NICHT.)
import { GENERATED_THEMES } from '../../themes/app/utils/themeRegistry.gen'
import {
  DEFAULT_SITE_VIBE,
  SITE_GOAL_IDS,
  SITE_VIBES,
  TRIAL_DAYS,
  evaluateSiteQuota,
  isEarlyAccessGoal,
  isSafeThemeToken,
  isTrialActive,
  parseSiteProfile,
  resolveVibe,
  serializeSiteProfile,
  trialDaysLeft,
  trialEndsAt,
} from '../shared/onboarding'
import { evaluateInviteCode } from '../shared/types/inviteCode'
import { resolveTenantAudience } from '../shared/types/tenantRecord'
import { createOnboardingSiteSchema, inviteCodeSchema } from '../schemas/onboarding'
import { createSlugSchema, isReservedSlug, slugToHost } from '../schemas/tenant'

const NOW = Date.parse('2026-07-24T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

describe('Vibes', () => {
  it('löst jeden Vibe auf ein Theme-Paar auf', () => {
    for (const vibe of SITE_VIBES) {
      const resolved = resolveVibe(vibe.id)
      expect(resolved.theme).toBe(vibe.theme)
      expect(resolved.variant).toBe(vibe.variant)
    }
  })

  it('fällt bei unbekanntem Vibe auf den Default statt auf leer', () => {
    // Fail-safe: eine Community ohne gültiges Theme wäre unbrauchbar.
    expect(resolveVibe('gibt-es-nicht')).toEqual(resolveVibe(DEFAULT_SITE_VIBE))
    expect(resolveVibe('').theme).not.toBe('')
  })

  it('nennt nur Themes UND Varianten, die es im Katalog wirklich gibt', () => {
    for (const vibe of SITE_VIBES) {
      const theme = GENERATED_THEMES.find(entry => entry.id === vibe.theme)
      expect(theme, `Theme "${vibe.theme}" (Vibe ${vibe.id}) fehlt im Katalog`).toBeTruthy()
      if (vibe.variant) {
        const variant = theme!.variants?.some(entry => entry.id === vibe.variant)
        expect(variant, `Variante "${vibe.variant}" fehlt bei Theme "${vibe.theme}"`).toBe(true)
      }
    }
  })

  it('hält alle gespeicherten Theme-Tokens attribut-sicher', () => {
    for (const vibe of SITE_VIBES) {
      expect(isSafeThemeToken(vibe.theme)).toBe(true)
      if (vibe.variant) expect(isSafeThemeToken(vibe.variant)).toBe(true)
    }
  })

  it('weist Theme-Tokens ab, die als HTML-Attribut gefährlich wären', () => {
    for (const bad of ['" onload="x', 'Lagoon', 'lagoon lagoon', '', 'a'.repeat(33), 'la_goon']) {
      expect(isSafeThemeToken(bad)).toBe(false)
    }
  })
})

describe('Ziele', () => {
  it('markiert genau die Early-Access-Ziele', () => {
    expect(isEarlyAccessGoal('events')).toBe(true)
    expect(isEarlyAccessGoal('courses')).toBe(true)
    expect(isEarlyAccessGoal('revenue')).toBe(true)
    expect(isEarlyAccessGoal('discussion')).toBe(false)
    expect(isEarlyAccessGoal('gibt-es-nicht')).toBe(false)
  })

  it('hat für jedes Ziel eine stabile Id', () => {
    expect(new Set(SITE_GOAL_IDS).size).toBe(SITE_GOAL_IDS.length)
  })
})

describe('Testphase', () => {
  it('endet 14 Tage nach dem Start', () => {
    const end = trialEndsAt(NOW)
    expect(Date.parse(end) - NOW).toBe(TRIAL_DAYS * DAY)
    expect(isTrialActive(end, NOW)).toBe(true)
    expect(isTrialActive(end, NOW + TRIAL_DAYS * DAY + 1)).toBe(false)
  })

  it('zählt die Resttage abwärts und bleibt bei 0 stehen', () => {
    const end = trialEndsAt(NOW)
    expect(trialDaysLeft(end, NOW)).toBe(TRIAL_DAYS)
    expect(trialDaysLeft(end, NOW + 13.5 * DAY)).toBe(1)
    expect(trialDaysLeft(end, NOW + 20 * DAY)).toBe(0)
  })

  it('behandelt fehlende und kaputte Werte als KEINE Testphase', () => {
    // Ein unlesbares Datum darf niemandem Pro-Limits schenken.
    for (const value of [undefined, null, '', 'irgendwann', '2026-13-45']) {
      expect(isTrialActive(value, NOW)).toBe(false)
      expect(trialDaysLeft(value, NOW)).toBe(0)
    }
  })
})

describe('Anzahl Communities pro Konto', () => {
  const inTrial = { status: 'active', trialEndsAt: trialEndsAt(NOW) }
  const settled = { status: 'active', trialEndsAt: new Date(NOW - DAY).toISOString() }

  it('erlaubt die erste Community immer', () => {
    expect(evaluateSiteQuota([], NOW)).toMatchObject({ allowed: true, limit: 3, used: 0 })
  })

  it('lässt während der Testphase keine zweite zu', () => {
    expect(evaluateSiteQuota([inTrial], NOW)).toMatchObject({
      allowed: false, limit: 1, used: 1, reason: 'trial_single_site',
    })
  })

  it('erlaubt nach der Testphase bis zu drei', () => {
    expect(evaluateSiteQuota([settled], NOW).allowed).toBe(true)
    expect(evaluateSiteQuota([settled, settled], NOW).allowed).toBe(true)
    expect(evaluateSiteQuota([settled, settled, settled], NOW)).toMatchObject({
      allowed: false, limit: 3, used: 3, reason: 'limit_reached',
    })
  })

  it('zählt deaktivierte Sites nicht mit', () => {
    const disabled = { status: 'disabled', trialEndsAt: trialEndsAt(NOW) }
    expect(evaluateSiteQuota([disabled], NOW)).toMatchObject({ allowed: true, limit: 3 })
  })
})

describe('Lese-Publikum (fail-closed)', () => {
  it('öffnet eine Site nur beim exakten Wert "public"', () => {
    expect(resolveTenantAudience('public')).toBe('public')
  })

  it('hält alles andere privat — insbesondere Bestands-Rows mit null', () => {
    // Appwrite backfillt Spalten-Defaults nicht: Rows von vor studio-016
    // liefern null. Auf Dev + Prod nachgemessen.
    for (const value of [null, undefined, '', 'members', 'PUBLIC', 'öffentlich', 'any']) {
      expect(resolveTenantAudience(value), String(value)).toBe('members')
    }
  })
})

describe('Profil-JSON', () => {
  it('geht durch einen Roundtrip verlustfrei', () => {
    const profile = {
      purpose: 'new', memberRange: 'to500', category: 'coaching',
      goal: 'discussion', description: 'Wir bringen Coaches zusammen.',
    } as const
    expect(parseSiteProfile(serializeSiteProfile(profile))).toEqual(profile)
  })

  it('wirft fremde und ungültige Werte weg statt die Anzeige zu sprengen', () => {
    const raw = JSON.stringify({
      purpose: 'weltherrschaft', memberRange: 'to500',
      category: 42, goal: null, fremd: 'egal',
    })
    expect(parseSiteProfile(raw)).toEqual({ memberRange: 'to500' })
  })

  it('kappt zu lange Beschreibungen', () => {
    const raw = JSON.stringify({ description: 'x'.repeat(5000) })
    expect(parseSiteProfile(raw).description).toHaveLength(600)
  })

  it('verträgt kaputtes JSON, Arrays und leere Werte', () => {
    for (const raw of ['', undefined, '{kaputt', '[]', 'null', '"text"']) {
      expect(parseSiteProfile(raw)).toEqual({})
    }
  })
})

describe('Einladungs-Codes', () => {
  const base = { status: 'active' as const, expiresAt: '', maxUses: 1, uses: 0 }

  it('lässt einen frischen Code durch', () => {
    expect(evaluateInviteCode(base, NOW)).toEqual({ valid: true })
  })

  it('unterscheidet die Ablehnungsgründe fürs Audit', () => {
    expect(evaluateInviteCode(null, NOW)).toEqual({ valid: false, reason: 'unknown' })
    expect(evaluateInviteCode({ ...base, status: 'revoked' }, NOW))
      .toEqual({ valid: false, reason: 'revoked' })
    expect(evaluateInviteCode({ ...base, expiresAt: new Date(NOW - 1).toISOString() }, NOW))
      .toEqual({ valid: false, reason: 'expired' })
    expect(evaluateInviteCode({ ...base, uses: 1 }, NOW))
      .toEqual({ valid: false, reason: 'exhausted' })
  })

  it('behandelt maxUses 0 als unbegrenzt', () => {
    expect(evaluateInviteCode({ ...base, maxUses: 0, uses: 999 }, NOW)).toEqual({ valid: true })
  })

  it('gilt bei unlesbarem Ablaufdatum als abgelaufen (im Zweifel zu)', () => {
    expect(evaluateInviteCode({ ...base, expiresAt: 'bald' }, NOW))
      .toEqual({ valid: false, reason: 'expired' })
  })

  it('nimmt Bestands-Rows mit leerem Status als aktiv', () => {
    expect(evaluateInviteCode({ ...base, status: '' as unknown as 'active' }, NOW))
      .toEqual({ valid: true })
  })

  it('prüft das Code-Format', () => {
    expect(inviteCodeSchema.safeParse('MAUI-2026-ABCD').success).toBe(true)
    for (const bad of ['kurz', 'mit leerzeichen', 'sonder!zeichen', 'a'.repeat(65)]) {
      expect(inviteCodeSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('Slug (der Kunde wählt nur das erste Label)', () => {
  const slug = createSlugSchema()

  it('normalisiert auf Kleinschreibung und baut den Host', () => {
    expect(slug.parse('  Meine-Community  ')).toBe('meine-community')
    expect(slugToHost('meine-community')).toBe('meine-community.pukalani.app')
  })

  it('weist reservierte und Phishing-nahe Labels ab', () => {
    for (const reserved of ['api', 'app', 'studio', 'login', 'security', 'billing', 'verify', 'pukalani']) {
      expect(isReservedSlug(reserved), reserved).toBe(true)
      expect(slug.safeParse(reserved).success, reserved).toBe(false)
    }
  })

  it('sperrt die Plattform-Hosts der Umbenennung (control/my/start)', () => {
    // Sonst könnte ein Selbstbedienungs-Kunde `my.pukalani.app` bekommen — mit
    // gültigem Zertifikat und unserem Namen die perfekte Anmeldedaten-Falle.
    for (const reserved of ['control', 'my', 'start', 'manage', 'new', 'photos', 'status', 'docs']) {
      expect(isReservedSlug(reserved), reserved).toBe(true)
      expect(slug.safeParse(reserved).success, reserved).toBe(false)
    }
  })

  it('weist alles ab, was kein DNS-Label ist', () => {
    for (const bad of ['ab', '-vorne', 'hinten-', 'punkt.im.namen', 'umläute', 'unter_strich', 'a'.repeat(41), '']) {
      expect(slug.safeParse(bad).success, bad).toBe(false)
    }
  })
})

describe('Wizard-Nutzlast', () => {
  const schema = createOnboardingSiteSchema()
  const valid = {
    name: 'Jungle Zipline',
    slug: 'jungle-zipline',
    purpose: 'new',
    memberRange: 'to100',
    category: 'creator',
    goal: 'relationships',
    vibe: 'calm',
    inviteCode: 'MAUI-2026-ABCD',
  }

  it('nimmt eine vollständige Antwortliste an', () => {
    const parsed = schema.parse({ ...valid, description: 'Menschen, die gern in Bäumen hängen.' })
    expect(parsed.slug).toBe('jungle-zipline')
  })

  it('verlangt einen Einladungs-Code (Early-Access-Tor)', () => {
    const { inviteCode: _drop, ...withoutCode } = valid
    expect(schema.safeParse(withoutCode).success).toBe(false)
  })

  it('lehnt Felder ab, die der Selbstbedienungs-Pfad nicht setzen darf', () => {
    // plan/projectId/mode sind bewusst KEINE Parameter — sonst könnte sich
    // jeder Pro-Limits oder ein fremdes Projekt zuschreiben.
    for (const extra of [{ plan: 'business' }, { projectId: 'fremd' }, { mode: 'silo' }, { host: 'api.pukalani.app' }]) {
      expect(schema.safeParse({ ...valid, ...extra }).success, JSON.stringify(extra)).toBe(false)
    }
  })

  it('weist unbekannte Katalog-Antworten ab', () => {
    expect(schema.safeParse({ ...valid, category: 'raumfahrt' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, vibe: 'neon' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, goal: 'weltfrieden' }).success).toBe(false)
  })
})
