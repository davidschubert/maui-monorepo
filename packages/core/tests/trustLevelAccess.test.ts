import { describe, expect, it } from 'vitest'
import { ALL_CAPABILITIES } from '../shared/authz'
import { actorForCommunityAccess, decideCommunityAccess } from '../shared/communityAccess'
import { COMMUNITY_ROLES, COMMUNITY_ROLE_CAPABILITIES, communityRoleHasCapability } from '../shared/communityAuthz'
import type { Capability } from '../shared/types/authz'
import {
  TRUST_LEVELS,
  TRUST_LEVEL_CAPABILITIES,
  normalizeTrustLevel,
  trustLevelCapabilitiesFor,
  trustLevelGrantsCapability,
  trustLevelHasCapability,
} from '../shared/trustLevel'

/**
 * DIE EINSPEISUNG DER VERTRAUENSSTUFEN INS BESTEHENDE RBAC (F1 Teilpaket 3,
 * Davids Architektur-Entscheidung vom 2026-08-04).
 *
 * Die Zusage lautet: „TL speisen das BESTEHENDE RBAC … EIN Rechtesystem …
 * ein paralleles TL-Prüfsystem ist ABGELEHNT." Und: „TL erweitert nur nach
 * unten, nimmt nie etwas weg." Beides wird hier festgenagelt.
 */

const NO_LABELS: readonly string[] = []

describe('die Stufen-Matrix selbst', () => {
  it('vergibt nur Capabilities, die es im Katalog gibt', () => {
    // Ein Tippfehler hier wäre ein Recht, das nie greift — lautlos, weil eine
    // unbekannte Capability schlicht nirgends geprüft wird.
    for (const level of TRUST_LEVELS) {
      for (const capability of TRUST_LEVEL_CAPABILITIES[level]) {
        expect(ALL_CAPABILITIES, `Stufe ${level}`).toContain(capability)
      }
    }
  })

  it('vergibt KEINE instanzweiten Rechte', () => {
    // Dieselbe harte Grenze, die der Rollen-Test zieht: eine Vertrauensstufe
    // ist eine Aussage über EINE Community und darf nie an der Plattform
    // rütteln.
    const instanceWide: Capability[] = [
      'system.manage', 'users.manage', 'billing.manage', 'audit.read',
      'sites.manage', 'storage.manage', 'changelog.manage',
    ]
    for (const level of TRUST_LEVELS) {
      for (const capability of instanceWide) {
        expect(trustLevelHasCapability(level, capability), `${level}/${capability}`).toBe(false)
      }
    }
  })

  it('vergibt keine Moderations- und keine Verwaltungs-Rechte', () => {
    // Davids v1-Zuschnitt ist eng: Themen ordnen, Zustände setzen, fremde
    // Beiträge bearbeiten. Melde-Queue, Ausblenden, Kategorien-Struktur, Team
    // und Abrechnung bleiben draußen — sonst wäre die Stufe eine Rolle.
    const reserved: Capability[] = [
      'posts.moderate', 'posts.manage', 'posts.appoint', 'comments.moderate',
      'reports.moderate', 'team.manage', 'branding.manage', 'community.billing',
    ]
    for (const level of TRUST_LEVELS) {
      for (const capability of reserved) {
        expect(trustLevelHasCapability(level, capability), `${level}/${capability}`).toBe(false)
      }
    }
  })

  it('bringt jedes Stufen-Recht auch bei den Rollen unter', () => {
    /**
     * DIE ZUSAGE „ERWEITERT NUR NACH UNTEN": kein Recht darf es geben, das
     * ausschließlich über eine Stufe erreichbar ist. Sonst dürfte ein
     * automatisch aufgestiegenes Mitglied mehr als der Owner seiner eigenen
     * Community — der klassische Weg, auf dem ein „Zusatzsystem" doch wieder
     * ein zweites Rechtesystem wird.
     */
    for (const level of TRUST_LEVELS) {
      for (const capability of TRUST_LEVEL_CAPABILITIES[level]) {
        expect(communityRoleHasCapability('owner', capability), capability).toBe(true)
      }
    }
  })

  it('sagt genau für die betroffenen Capabilities, dass eine Stufe sie verleihen kann', () => {
    // Daran hängt der Preis: `requireCommunityPermission` schlägt die Stufe nur
    // nach, wenn hier `true` steht. Ein falsches `false` wäre ein Recht, das
    // nie greift; ein falsches `true` eine Abfrage an jeder Route.
    const granting = ALL_CAPABILITIES.filter(trustLevelGrantsCapability)
    expect([...granting].sort()).toEqual(['posts.arrange', 'posts.curate', 'posts.revise'])
  })
})

describe('eine gelesene Zahl auf eine Stufe bringen', () => {
  it('macht aus allem Unbrauchbaren die 0', () => {
    // Bestandszeilen tragen NULL (Appwrite backfillt Defaults nicht) — das
    // heißt „nie gerechnet", nicht „kaputt".
    for (const value of [undefined, null, Number.NaN, -1, 'drei', {}]) {
      expect(normalizeTrustLevel(value), String(value)).toBe(0)
    }
  })

  it('kappt nach oben, statt zu verwerfen', () => {
    // Eine 7 als 0 zu lesen nähme jemandem still seine Rechte; eine kaputte
    // Zahl darf nie MEHR ergeben als eine gültige, aber auch nicht weniger als
    // die höchste.
    expect(normalizeTrustLevel(7)).toBe(4)
    expect(normalizeTrustLevel(2.9)).toBe(2)
  })
})

describe('decideCommunityAccess mit Stufe', () => {
  it('lässt eine Stufe 3 fremde Themen ordnen — als MITGLIED', () => {
    const decision = decideCommunityAccess({
      capability: 'posts.curate', labels: NO_LABELS, tenantScoped: true, role: 'viewer', trustLevel: 3,
    })
    expect(decision).toEqual({ allowed: true, via: 'trust', trustLevel: 3 })
    // Der `actor` ist die halbe Miete: als 'operator' hinge eine Stufe 4 an der
    // Inhalts-Sperre M13 vorbei und würde per A5 nicht einmal Mitglied.
    expect(actorForCommunityAccess('trust')).toBe('member')
  })

  it('gibt einer Stufe 3 NICHT die Rechte der Stufe 4', () => {
    for (const capability of ['posts.arrange', 'posts.revise'] as const) {
      expect(decideCommunityAccess({
        capability, labels: NO_LABELS, tenantScoped: true, role: 'viewer', trustLevel: 3,
      }).allowed, capability).toBe(false)
    }
  })

  it('lässt die Rolle gewinnen, wenn sie reicht', () => {
    // Die Reihenfolge ist Absicht: der Weg soll im Ergebnis sichtbar bleiben.
    const decision = decideCommunityAccess({
      capability: 'posts.curate', labels: NO_LABELS, tenantScoped: true, role: 'moderator', trustLevel: 4,
    })
    expect(decision).toEqual({ allowed: true, via: 'role', role: 'moderator' })
  })

  it('erzeugt für ein verdientes Recht KEINEN Break-Glass', () => {
    // Ein Operator, der zugleich Stufe 3 hat, kommt als Mensch herein, den er
    // darstellt — sonst stünde eine Warnzeile im Log für etwas, das er sich
    // erarbeitet hat.
    const decision = decideCommunityAccess({
      capability: 'posts.curate', labels: ['admin'], tenantScoped: true, role: 'viewer', trustLevel: 3,
    })
    expect(decision).toEqual({ allowed: true, via: 'trust', trustLevel: 3 })
  })

  it('ändert ohne Stufe GAR NICHTS', () => {
    /**
     * Der Rückwärts-Wächter: für jede Rolle und jede Capability muss die
     * Entscheidung ohne Stufe exakt die alte sein. Wäre hier irgendwo ein
     * Unterschied, hätte dieses Teilpaket bestehende Rechte verschoben.
     */
    for (const role of COMMUNITY_ROLES) {
      for (const capability of ALL_CAPABILITIES) {
        const expected = COMMUNITY_ROLE_CAPABILITIES[role].includes(capability)
        expect(decideCommunityAccess({
          capability, labels: NO_LABELS, tenantScoped: true, role,
        }).allowed, `${role}/${capability}`).toBe(expected)
      }
    }
  })

  it('lässt den Operator im Silo unverändert durch', () => {
    // Ohne Mandanten bleibt der Operator-Weg der erste — die Stufe kommt dort
    // nur als Zusatz für den, der KEIN Label hat.
    expect(decideCommunityAccess({
      capability: 'posts.curate', labels: ['admin'], tenantScoped: false, role: null, trustLevel: 0,
    })).toEqual({ allowed: true, via: 'single-tenant' })
    expect(decideCommunityAccess({
      capability: 'posts.curate', labels: NO_LABELS, tenantScoped: false, role: null, trustLevel: 3,
    })).toEqual({ allowed: true, via: 'trust', trustLevel: 3 })
  })
})

describe('die Capabilities einer Stufe für die Oberfläche', () => {
  it('liest eine kaputte Zahl als „keine Stufe"', () => {
    expect([...trustLevelCapabilitiesFor(undefined)]).toEqual([])
    expect([...trustLevelCapabilitiesFor(3)]).toEqual(['posts.curate'])
  })
})
