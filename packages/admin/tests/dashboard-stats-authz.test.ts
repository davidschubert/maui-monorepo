import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decideSiteAccess } from '../../core/shared/siteAccess'
import { TENANT_ROLES, type TenantRole } from '../../core/shared/tenantAuthz'

/**
 * C1 — die Kennzahlen der Dashboard-Übersicht hängen nicht mehr an globalen
 * Operator-Labels.
 *
 * `/api/admin/stats` und `/api/admin/analytics` prüften label-only mit
 * `requirePermission`. Ein Kunden-Owner hat kein globales Label: er kam auf
 * seine eigene Übersicht, bekam von beiden Routen 403 und sah nur Nullen.
 *
 * Diese Suite hält die zwei ENTSCHEIDUNGEN fest, die hinter der Umstellung
 * stehen:
 *  1. Der Gate ist `dashboard.access` — die Capability, die ALLE fünf
 *     Site-Rollen tragen und die sie überhaupt erst auf diese Seite bringt.
 *     Enger zu gaten hieße, den Befund für Editor und Viewer zu wiederholen.
 *  2. Nicht jede Kennzahl folgt dem Gate: `commentsReported` (offene
 *     Meldungen) ist Moderations-Wissen und braucht `comments.moderate` —
 *     ohne sie liefert die Route `null`, und die Kachel entfällt, genau wie
 *     `usersTotal` im Pool. Lieber keine Zahl als eine, die nicht hingehört.
 */

const routeSource = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../server/api/admin/${name}`, import.meta.url)), 'utf8')

const access = (role: TenantRole | null, labels: string[] = []) =>
  decideSiteAccess({ capability: 'dashboard.access', tenantScoped: true, role, labels })

const moderate = (role: TenantRole | null, labels: string[] = []) =>
  decideSiteAccess({ capability: 'comments.moderate', tenantScoped: true, role, labels })

describe('Kennzahlen-Routen im Pool: jede Site-Rolle erreicht ihre eigene Übersicht', () => {
  it('lässt ALLE fünf Site-Rollen durch — der Owner sieht keine Nullen mehr', () => {
    for (const role of TENANT_ROLES) {
      expect(access(role), role).toEqual({ allowed: true, via: 'role', role })
    }
  })

  it('weist ab, wer auf DIESER Site keine Rolle hat', () => {
    expect(access(null)).toEqual({ allowed: false, reason: 'no-role' })
  })

  it('deckt die ganze Rollen-Matrix ab (neue Rolle ⇒ dieser Test bricht)', () => {
    const verdicts = Object.fromEntries(TENANT_ROLES.map(role => [role, access(role).allowed]))
    expect(verdicts).toEqual({ owner: true, admin: true, moderator: true, editor: true, viewer: true })
  })

  it('lässt den Betreiber per Break-Glass durch, gemeldet als operator', () => {
    expect(access(null, ['admin'])).toEqual({ allowed: true, via: 'operator' })
    // moderator trägt dashboard.access ebenfalls (authz.ts) — Support bleibt Support.
    expect(access(null, ['moderator'])).toEqual({ allowed: true, via: 'operator' })
  })
})

describe('Gemeldete Kommentare: nur für die, die auch moderieren dürfen', () => {
  it('gibt Owner, Admin und Moderator die Zahl', () => {
    for (const role of ['owner', 'admin', 'moderator'] as const) {
      expect(moderate(role).allowed, role).toBe(true)
    }
  })

  it('hält sie von Editor und Viewer fern — die Kachel entfällt dort (null)', () => {
    expect(moderate('editor')).toEqual({ allowed: false, reason: 'insufficient-role' })
    expect(moderate('viewer')).toEqual({ allowed: false, reason: 'insufficient-role' })
  })

  it('trennt damit die beiden Prüfungen: Zugang ≠ Einsicht in die Warteschlange', () => {
    for (const role of ['editor', 'viewer'] as const) {
      expect(access(role).allowed, role).toBe(true)
      expect(moderate(role).allowed, role).toBe(false)
    }
  })
})

describe('Silo (comments-App): Verhalten unverändert', () => {
  it('verlangt ohne Mandanten-Kontext weiterhin ein globales Label', () => {
    expect(decideSiteAccess({ capability: 'dashboard.access', tenantScoped: false, role: null, labels: ['admin'] }))
      .toEqual({ allowed: true, via: 'single-tenant' })
    expect(decideSiteAccess({ capability: 'dashboard.access', tenantScoped: false, role: null, labels: [] }))
      .toEqual({ allowed: false, reason: 'forbidden' })
  })

  it('öffnet ohne Mandanten NICHTS über eine mitgegebene Site-Rolle', () => {
    expect(decideSiteAccess({ capability: 'dashboard.access', tenantScoped: false, role: 'owner', labels: [] }).allowed)
      .toBe(false)
  })
})

describe('Die Routen selbst: awaited Site-Gate statt label-only', () => {
  for (const file of ['stats.get.ts', 'analytics.get.ts']) {
    it(`${file} gatet mit await requireSitePermission(..., 'dashboard.access')`, () => {
      const source = routeSource(file)
      expect(source).toContain(`await requireSitePermission(event, 'dashboard.access')`)
      // Das label-only `requirePermission` war der Befund — es darf nicht
      // zurückkommen.
      expect(source).not.toMatch(/(?<!Site)requirePermission\(/)
      // `requireSitePermission` ist bewusst async (siteAccess.ts): ein
      // vergessenes `await` wäre ein nicht abgewartetes Promise — also gar
      // keine Prüfung. JEDER Aufruf muss awaited sein.
      const calls = [...source.matchAll(/(\w+\s+)?requireSitePermission\(/g)]
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) expect(call[1]?.trim()).toBe('await')
    })
  }
})
