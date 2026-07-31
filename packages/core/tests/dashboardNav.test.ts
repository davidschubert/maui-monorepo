import { describe, it, expect } from 'vitest'
import {
  resolveDashboardPlace,
  scopeVisibleAt,
  filterDashboardModules,
  type DashboardNavModule,
  type DashboardPlace,
  type DashboardScope,
} from '../shared/dashboardNav'
import { COMMUNITY_ROLES, communityCapabilitiesFor } from '../shared/communityAuthz'
import { capabilitiesFor } from '../shared/authz'
import type { Capability } from '../shared/types/authz'

const PLACES: DashboardPlace[] = ['community', 'control', 'single-tenant']
const SCOPES: DashboardScope[] = ['operator', 'community', 'account']

describe('resolveDashboardPlace', () => {
  it('ohne Mandantenfähigkeit ist jeder Host Einzelbetrieb (Silo, Betreiber-Konsole, Playground)', () => {
    expect(resolveDashboardPlace(false, false)).toBe('single-tenant')
    // tenantHost kann ohne Gate gar nicht true werden (isTenantHost); selbst
    // dann bliebe es Einzelbetrieb — die Config ist die stärkere Aussage.
    expect(resolveDashboardPlace(false, true)).toBe('single-tenant')
  })
  it('mit Gate trennt der Host: Mandant vs. Kontroll-Host', () => {
    expect(resolveDashboardPlace(true, true)).toBe('community')
    expect(resolveDashboardPlace(true, false)).toBe('control')
  })
})

describe('scopeVisibleAt — die eine Regel (E9)', () => {
  it('Betreiber-Module verschwinden auf einem MANDANTEN-Host', () => {
    expect(scopeVisibleAt('operator', 'community')).toBe(false)
  })
  it('Betreiber-Module stehen auf Kontroll-Host und im Einzelbetrieb', () => {
    expect(scopeVisibleAt('operator', 'control')).toBe(true)
    expect(scopeVisibleAt('operator', 'single-tenant')).toBe(true)
  })
  it('Community-Module stehen NUR auf einem Mandanten-Host …', () => {
    expect(scopeVisibleAt('community', 'community')).toBe(true)
    expect(scopeVisibleAt('community', 'control')).toBe(false)
  })
  it('… mit der Ausnahme Einzelbetrieb: dort gibt es keine zweite Ebene (Silo behält sein Menü)', () => {
    expect(scopeVisibleAt('community', 'single-tenant')).toBe(true)
  })
  it('Konto-Module stehen überall', () => {
    for (const place of PLACES) expect(scopeVisibleAt('account', place), place).toBe(true)
  })
  it('an JEDEM Ort ist mindestens eine Ebene sichtbar (kein leeres Menü durch die Regel)', () => {
    for (const place of PLACES) {
      expect(SCOPES.some(scope => scopeVisibleAt(scope, place)), place).toBe(true)
    }
  })
})

/** Prüf-Matrix: Modul-Liste × (Ort, Rolle/Labels) → sichtbare Ids. */
interface TestModule extends DashboardNavModule {
  id: string
}

const MODULES: TestModule[] = [
  { id: 'tenants', scope: 'operator', requiredCapability: 'sites.manage' },
  { id: 'billing', scope: 'operator', requiredCapability: 'billing.manage', placement: 'userMenu' },
  { id: 'docs', scope: 'operator', requiredCapability: 'dashboard.access', placement: 'bottom' },
  { id: 'comments', scope: 'community', requiredCapability: 'comments.moderate' },
  { id: 'members', scope: 'community', requiredCapability: 'team.manage' },
  { id: 'themes', scope: 'community', requiredCapability: 'system.manage', productKey: 'themes' },
  { id: 'profile', scope: 'account', requiredCapability: 'dashboard.access' },
]

/**
 * Der Betrachter mit seinen ZWEI getrennten Rechte-Quellen — genau so, wie
 * das Layout sie hält: globales Label vs. Rolle in dieser Community.
 */
function viewer(labels: string[], role: Parameters<typeof communityCapabilitiesFor>[0]) {
  const operatorCaps = capabilitiesFor(labels)
  const memberCaps = communityCapabilitiesFor(role)
  return {
    canAsOperator: (capability: Capability) => operatorCaps.has(capability),
    canAsMember: (capability: Capability) => memberCaps.has(capability),
  }
}

type Viewer = ReturnType<typeof viewer>

function visible(place: DashboardPlace, who: Viewer, placement: 'nav' | 'bottom' | 'userMenu' = 'nav') {
  return filterDashboardModules(MODULES, { place, placement, ...who }).map(m => m.id)
}

describe('filterDashboardModules — Ebene × Rolle', () => {
  const operator = viewer(['admin'], null)
  const owner = viewer([], 'owner')
  const moderator = viewer([], 'moderator')
  const guest = viewer([], null)

  it('Betreiber auf einem MANDANTEN-Host sieht keine Betreiber-Module mehr', () => {
    // Er hat jede Capability (admin = ALL_CAPABILITIES) — es ist der ORT, der
    // ihn hier bremst, nicht das Recht.
    expect(visible('community', operator)).toEqual(['comments', 'members', 'themes', 'profile'])
    expect(visible('community', operator, 'bottom')).toEqual([])
    expect(visible('community', operator, 'userMenu')).toEqual([])
  })

  it('Betreiber auf dem KONTROLL-Host sieht keine Community-Module', () => {
    expect(visible('control', operator)).toEqual(['tenants', 'profile'])
    expect(visible('control', operator, 'bottom')).toEqual(['docs'])
    expect(visible('control', operator, 'userMenu')).toEqual(['billing'])
  })

  it('Betreiber im EINZELBETRIEB sieht wie vor E9 alles, was seine Rechte hergeben', () => {
    expect(visible('single-tenant', operator)).toEqual(['tenants', 'comments', 'members', 'themes', 'profile'])
    expect(visible('single-tenant', operator, 'bottom')).toEqual(['docs'])
    expect(visible('single-tenant', operator, 'userMenu')).toEqual(['billing'])
  })

  it('Community-Owner auf seinem Host: Community-Module nach Capability, nie Betreiber-Module', () => {
    // themes fehlt bewusst: die Seite verlangt system.manage, das trägt keine
    // Community-Rolle — das Menü verspricht nichts, was die Seite nicht hält.
    expect(visible('community', owner)).toEqual(['comments', 'members', 'profile'])
  })

  it('Community-Moderator sieht nur, was seine Rolle trägt', () => {
    expect(visible('community', moderator)).toEqual(['comments', 'profile'])
  })

  it('Gast/rollenloser Nutzer sieht nirgends etwas (dashboard.access fehlt ihm)', () => {
    for (const place of PLACES) expect(visible(place, guest), place).toEqual([])
  })

  it('KEINE Community-Rolle erreicht je ein Betreiber-Modul — an keinem Ort (N1)', () => {
    // Härter als der Ort allein: 'docs' verlangt nur `dashboard.access`, das
    // JEDE Community-Rolle trägt, und im Einzelbetrieb bremst kein Ort. Was
    // ihn dort fernhält, ist die getrennte Rechte-Quelle (moduleAllowedFor).
    const operatorIds = MODULES.filter(m => m.scope === 'operator').map(m => m.id)
    for (const role of COMMUNITY_ROLES) {
      const who = viewer([], role)
      for (const place of PLACES) {
        for (const placement of ['nav', 'bottom', 'userMenu'] as const) {
          const seen = visible(place, who, placement)
          for (const id of operatorIds) expect(seen, `${role}@${place}/${placement}`).not.toContain(id)
        }
      }
    }
  })

  it('der Betreiber-Break-Glass bleibt: mit Label sieht er Community-Module auf dem Kunden-Host', () => {
    // Serverseitig erlaubt und protokolliert (decideCommunityAccess) — ein
    // Menü, das ihn verschweigt, wäre eine zweite, abweichende Regel.
    expect(visible('community', viewer(['admin'], null))).toContain('comments')
  })

  it('Konto-Module bleiben für jeden Angemeldeten an jedem Ort stehen', () => {
    for (const role of COMMUNITY_ROLES) {
      for (const place of PLACES) {
        expect(visible(place, viewer([], role)), `${role}@${place}`).toContain('profile')
      }
    }
  })

  it('abgeschaltetes Produkt (F2) fällt zusätzlich heraus', () => {
    const seen = filterDashboardModules(MODULES, {
      place: 'single-tenant',
      placement: 'nav',
      ...operator,
      productOn: key => key !== 'themes',
    }).map(m => m.id)
    expect(seen).not.toContain('themes')
    expect(seen).toContain('comments')
  })

  it('ein Modul OHNE gültige Ebene erscheint nirgends (fail-closed — app.config wird nicht typgeprüft)', () => {
    const broken = [{ id: 'vergessen', requiredCapability: 'dashboard.access' } as unknown as TestModule]
    for (const place of PLACES) {
      expect(
        filterDashboardModules(broken, { place, placement: 'nav', ...viewer(['admin'], 'owner') }),
        place,
      ).toEqual([])
    }
  })

  it('placement trennt sauber — ein Modul erscheint an genau EINEM Ausgang', () => {
    const all = (['nav', 'bottom', 'userMenu'] as const)
      .flatMap(placement => visible('single-tenant', operator, placement))
    expect(all.length).toBe(new Set(all).size)
  })
})
