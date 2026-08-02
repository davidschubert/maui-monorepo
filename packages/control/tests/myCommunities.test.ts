import { describe, expect, it } from 'vitest'
import { projectMyCommunities, type MyCommunityFacts } from '../shared/myCommunities'

/**
 * Die Entscheidungen der Kunden-Übersicht (F12 + M13), festgenagelt:
 * stillgelegte Communities fallen weg, GESPERRTE bleiben stehen (der Owner muss
 * ja zahlen können), eine abuse-Sperre sieht nur der Owner, die Testphase sieht
 * nur wer zahlt, eigene Communities stehen oben.
 */
function facts(overrides: Partial<MyCommunityFacts> = {}): MyCommunityFacts {
  return {
    communityId: 'c1',
    name: 'Morgenlicht',
    host: 'morgenlicht.pukalani.app',
    role: 'owner',
    communityStatus: 'active',
    plan: 'personal',
    trialEndsAt: '2026-08-14T00:00:00.000Z',
    suspension: '',
    ...overrides,
  }
}

describe('Kunden-Übersicht projizieren', () => {
  it('gibt Name, Adresse, Rolle und Plan heraus', () => {
    const [view] = projectMyCommunities([facts()])
    expect(view).toEqual({
      communityId: 'c1',
      name: 'Morgenlicht',
      host: 'morgenlicht.pukalani.app',
      role: 'owner',
      plan: 'personal',
      trialEndsAt: '2026-08-14T00:00:00.000Z',
      suspension: '',
      readOnly: false,
    })
  })

  it('lässt stillgelegte Communities weg — ihr Host antwortet 404', () => {
    expect(projectMyCommunities([facts({ communityStatus: 'disabled' })])).toEqual([])
  })

  it('zeigt die Testphase NUR dem, der abrechnet (community.billing = owner)', () => {
    for (const role of ['admin', 'moderator', 'editor', 'viewer'] as const) {
      const [view] = projectMyCommunities([facts({ role })])
      expect(view?.trialEndsAt, role).toBeNull()
    }
    expect(projectMyCommunities([facts({ role: 'owner' })])[0]?.trialEndsAt).toBe('2026-08-14T00:00:00.000Z')
  })

  it('normalisiert Alt-Pläne und leere Spalten auf Basic', () => {
    expect(projectMyCommunities([facts({ plan: '' })])[0]?.plan).toBe('basic')
    expect(projectMyCommunities([facts({ plan: null })])[0]?.plan).toBe('basic')
    expect(projectMyCommunities([facts({ plan: 'business' })])[0]?.plan).toBe('pro')
  })

  it('sortiert eigene zuerst, danach alphabetisch', () => {
    const rows = projectMyCommunities([
      facts({ communityId: 'v2', name: 'Zebra', role: 'viewer' }),
      facts({ communityId: 'v1', name: 'Anker', role: 'viewer' }),
      facts({ communityId: 'a1', name: 'Verein', role: 'admin' }),
      facts({ communityId: 'o1', name: 'Morgenlicht', role: 'owner' }),
    ])
    expect(rows.map(row => row.communityId)).toEqual(['o1', 'a1', 'v1', 'v2'])
  })

  it('bleibt bei leerer Eingabe leer', () => {
    expect(projectMyCommunities([])).toEqual([])
  })

  // ── M13: Sperre ───────────────────────────────────────────────────────────

  it('behält eine billing-gesperrte Community in der Liste — der Owner muss zahlen können', () => {
    const [view] = projectMyCommunities([facts({ suspension: 'billing' })])
    expect(view?.suspension).toBe('billing')
  })

  it('zeigt eine abuse-gesperrte Community NUR dem, der abrechnet', () => {
    // Der Host ist offline; für alle anderen ist die Community schlicht weg —
    // dieselbe Erfahrung wie bei jeder abgeschalteten Adresse. Und der Vorwurf
    // gehört dem, an den er gerichtet ist, nicht seinen zwanzig Mitgliedern.
    for (const role of ['admin', 'moderator', 'editor', 'viewer'] as const) {
      expect(projectMyCommunities([facts({ role, suspension: 'abuse' })]), role).toEqual([])
    }
    const [view] = projectMyCommunities([facts({ role: 'owner', suspension: 'abuse' })])
    expect(view?.suspension).toBe('abuse')
  })

  it('verschweigt den GRUND allen ohne community.billing — sagt ihnen aber, DASS nichts geht', () => {
    // billing-gesperrt heißt: die Adresse funktioniert weiter. Die KARTE bleibt
    // deshalb für alle stehen. Der GRUND ist eine Vertragsauskunft; die
    // TATSACHE „hier kannst du gerade nichts schreiben" erlebt jeder Mitleser
    // beim ersten Versuch — sie zu verschweigen war eine Falle, keine
    // Geheimhaltung (Befund 2 des Wechselwirkungs-Audits).
    for (const role of ['admin', 'moderator', 'editor', 'viewer'] as const) {
      const [view] = projectMyCommunities([facts({ role, suspension: 'billing' })])
      expect(view?.host, role).toBe('morgenlicht.pukalani.app')
      expect(view?.suspension, role).toBe('')
      expect(view?.readOnly, role).toBe(true)
    }
  })

  it('setzt readOnly für den Abrechnenden genauso — DASS gilt für alle, WARUM nur für ihn', () => {
    const [owner] = projectMyCommunities([facts({ role: 'owner', suspension: 'billing' })])
    expect(owner?.readOnly).toBe(true)
    expect(owner?.suspension).toBe('billing')
    const [abuse] = projectMyCommunities([facts({ role: 'owner', suspension: 'abuse' })])
    expect(abuse?.readOnly).toBe(true)
  })

  it('lässt readOnly aus, solange nichts gesperrt ist', () => {
    for (const role of ['owner', 'admin', 'viewer'] as const) {
      expect(projectMyCommunities([facts({ role })])[0]?.readOnly, role).toBe(false)
    }
  })

  it('liest die rohe Spalte fail-open: null und Unfug heißen nicht gesperrt', () => {
    for (const suspension of [null, 'abusive']) {
      const [view] = projectMyCommunities([facts({ suspension })])
      expect(view?.suspension, String(suspension)).toBe('')
      // Fail-open zieht bis in die Anzeige durch: ein krummer Spaltenwert darf
      // keiner gesunden Community ein Schloss auf die Karte malen.
      expect(view?.readOnly, String(suspension)).toBe(false)
    }
  })
})
