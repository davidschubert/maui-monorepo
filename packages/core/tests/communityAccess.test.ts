import { describe, expect, it } from 'vitest'
import { actorForCommunityAccess, decideCommunityAccess, isCommunityMember } from '../shared/communityAccess'

const OWNER = { role: 'owner' as const, labels: [] as string[] }

describe('Site-Zugriff: der normale Weg ist die Rolle', () => {
  it('lässt den Owner seine Seiten pflegen — ohne jedes globale Label', () => {
    const decision = decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, ...OWNER })
    expect(decision).toEqual({ allowed: true, via: 'role', role: 'owner' })
  })

  it('lässt den Moderator moderieren, aber nicht schreiben', () => {
    expect(decideCommunityAccess({ capability: 'comments.moderate', tenantScoped: true, role: 'moderator', labels: [] }).allowed).toBe(true)
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: 'moderator', labels: [] }))
      .toEqual({ allowed: false, reason: 'insufficient-role' })
  })

  it('lässt den Editor schreiben, aber nicht moderieren', () => {
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: 'editor', labels: [] }).allowed).toBe(true)
    expect(decideCommunityAccess({ capability: 'comments.moderate', tenantScoped: true, role: 'editor', labels: [] }).allowed).toBe(false)
  })

  it('lässt den Viewer nichts verwalten', () => {
    for (const capability of ['pages.manage', 'comments.moderate', 'branding.manage'] as const) {
      expect(decideCommunityAccess({ capability, tenantScoped: true, role: 'viewer', labels: [] }).allowed, capability).toBe(false)
    }
  })
})

describe('Fremde bleiben draußen', () => {
  it('weist ab, wer in DIESER Community keine Rolle hat', () => {
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: null, labels: [] }))
      .toEqual({ allowed: false, reason: 'no-role' })
  })

  it('lässt eine Owner-Rolle NICHT auf eine andere Community durchschlagen', () => {
    // Der Aufrufer löst die Rolle je Site auf; hier ist die Zusicherung, dass
    // „kein Rollen-Ergebnis" wirklich Nein heißt — auch für einen Menschen, der
    // woanders Owner ist.
    expect(decideCommunityAccess({ capability: 'community.delete', tenantScoped: true, role: null, labels: [] }).allowed).toBe(false)
  })
})

describe('Operator-Break-Glass', () => {
  it('lässt den Betreiber durch — als operator, nicht als Rolle', () => {
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: null, labels: ['admin'] }))
      .toEqual({ allowed: true, via: 'operator' })
  })

  it('meldet Rolle statt Break-Glass, wenn die Rolle schon reicht', () => {
    // Wichtig fürs Log: ein Betreiber, der zufällig auch Mitglied ist, soll
    // nicht bei jedem Klick einen Break-Glass-Eintrag erzeugen.
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: 'owner', labels: ['admin'] }))
      .toEqual({ allowed: true, via: 'role', role: 'owner' })
  })

  it('hilft einem Moderator-Label nicht über eine Inhalts-Capability', () => {
    // Das globale moderator-Label trägt comments.moderate, aber nicht pages.manage.
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: null, labels: ['moderator'] }).allowed).toBe(false)
    expect(decideCommunityAccess({ capability: 'comments.moderate', tenantScoped: true, role: null, labels: ['moderator'] }))
      .toEqual({ allowed: true, via: 'operator' })
  })
})

describe('Single-Tenant-Apps bleiben unverändert', () => {
  it('entscheidet ohne Mandanten weiter über die globalen Labels', () => {
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: false, role: null, labels: ['admin'] }))
      .toEqual({ allowed: true, via: 'single-tenant' })
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: false, role: null, labels: [] }))
      .toEqual({ allowed: false, reason: 'forbidden' })
  })

  it('ignoriert eine Site-Rolle ohne Mandanten-Kontext', () => {
    // Ohne Mandanten gibt es keine Site — eine mitgegebene Rolle wäre sinnlos
    // und darf nichts öffnen.
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: false, role: 'owner', labels: [] }).allowed).toBe(false)
  })
})

/**
 * WER HANDELT — die Ableitung für die Datentür (F17, 2026-08-01).
 *
 * Seit C1c trennt `tenantDb` „welcher Client fragt" (`as`) von „wer handelt"
 * (`actor`). Für die Redaktions-Routen (Kurs, Lektion, Termin, Seite) ist das
 * keine freie Wahl: der Gate hat die Frage schon beantwortet, und diese
 * Funktion ist die Übersetzung. Sie muss in BEIDE Richtungen stimmen — ein
 * pauschales 'member' machte den Betreiber im Break-Glass zum Mitglied der
 * Kunden-Community, ein pauschales 'operator' ließe die Redaktion an der
 * Inhalts-Sperre vorbeischreiben.
 */
describe('actorForCommunityAccess — der Gate sagt, wer handelt', () => {
  it('wer über seine ROLLE hereinkommt, ist ein Mensch dieser Community', () => {
    // ⇒ Inhalts-Sperre (M13) und Beitritt (A5) gelten.
    expect(actorForCommunityAccess('role')).toBe('member')
  })

  it('das Betreiber-Break-Glass handelt für JEMAND ANDEREN', () => {
    // Zwei Wirkungen auf einmal: der Betreiber wird nicht Mitglied der
    // Kunden-Community, und er kommt in einer gesperrten Community weiter an
    // die Inhalte seines Kunden — dieselbe Begründung, aus der die Moderation
    // offen bleibt.
    expect(actorForCommunityAccess('operator')).toBe('operator')
  })

  it('ohne Mandanten (Silo, Playground, Kontroll-Host) ist es wörtlich Operator-RBAC', () => {
    // Wirkung hat das dort ohnehin keine: ohne Mandanten gibt es weder eine
    // Sperre noch eine Mitgliedschaft. Die Antwort soll trotzdem ehrlich sein.
    expect(actorForCommunityAccess('single-tenant')).toBe('operator')
  })

  it('deckt JEDEN erlaubten Weg ab — eine neue Spielart fällt hier auf', () => {
    // `via` ist eine geschlossene Union; kommt ein vierter Weg dazu, muss hier
    // entschieden werden, statt dass er still als 'operator' durchrutscht.
    const decisions = [
      decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: 'owner', labels: [] }),
      decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: null, labels: ['admin'] }),
      decideCommunityAccess({ capability: 'pages.manage', tenantScoped: false, role: null, labels: ['admin'] }),
    ].filter(decision => decision.allowed === true)
    expect(decisions.map(decision => actorForCommunityAccess(decision.via)))
      .toEqual(['member', 'operator', 'operator'])
  })
})

/**
 * H1 (2026-08-05) — „gehört dieser Mensch hierher?" ist eine ANDERE Frage als
 * „darf er diese eine Sache". Der eigene @name hängt an der ersten.
 */
describe('Zugehörigkeit: wer bekommt hier einen Namen?', () => {
  const BASE = { tenantScoped: true, role: null, hasCommunityLabel: false, recentlyDenied: false }

  it('der Fremde auf einem Community-Host gehört NICHT dazu — das ist H1', () => {
    // Genau der gemessene Fall: ein Pool-Konto ohne jede Zugehörigkeit auf
    // einem fremden Host. Vor der Wache bekam es dort eine Handle-Zeile.
    expect(isCommunityMember(BASE)).toBe(false)
  })

  it('eine Rolle in DIESER Community genügt — jede, auch die kleinste', () => {
    for (const role of ['owner', 'admin', 'moderator', 'editor', 'viewer'] as const) {
      expect(isCommunityMember({ ...BASE, role }), role).toBe(true)
    }
  })

  it('das Community-Label genügt ebenfalls — der A5-Beitritt durch Schreiben', () => {
    // Wer mit seinem ersten Beitrag beitritt, hat die Zeile erst seit
    // Millisekunden; der 30-s-Cache des Rollen-Resolvers weiss noch nichts.
    // `grantCommunityLabel` hat das Label im selben Request aber schon in
    // event.context.user.labels geschrieben.
    expect(isCommunityMember({ ...BASE, hasCommunityLabel: true })).toBe(true)
  })

  it('ein frischer Entzug schlägt BEIDES — sonst hätte er ein 30-Sekunden-Loch', () => {
    expect(isCommunityMember({ ...BASE, role: 'owner', recentlyDenied: true })).toBe(false)
    expect(isCommunityMember({ ...BASE, hasCommunityLabel: true, recentlyDenied: true })).toBe(false)
  })

  it('ohne Mandanten (Silo, Kontroll-Host, Playground) gehört JEDER dazu', () => {
    // Dort ist das Projekt die Grenze. Ein Gate wäre keine Grenze, sondern
    // eine Aussperrung: apps/comments hat weder Rollen noch Labels.
    expect(isCommunityMember({ ...BASE, tenantScoped: false })).toBe(true)
    // Und auch ein frischer Entzug ändert das nicht — es gibt dort nichts zu
    // entziehen, die Notiz könnte nur aus einer anderen Community stammen.
    expect(isCommunityMember({ ...BASE, tenantScoped: false, recentlyDenied: true })).toBe(true)
  })
})
