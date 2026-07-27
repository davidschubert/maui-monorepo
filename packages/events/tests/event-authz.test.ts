import { beforeAll, describe, expect, it } from 'vitest'
import { decideSiteAccess } from '../../core/shared/siteAccess'
import { TENANT_ROLES, type TenantRole } from '../../core/shared/tenantAuthz'

/**
 * N5a — die Events-Verwaltung hängt nicht mehr an globalen Operator-Labels.
 *
 * Die Verwaltungs-Routen (index.post, manage.get, [id].patch/.delete,
 * [id]/series.delete, [id]/cover.post/.delete) gaten über
 * `requireSitePermission(event, 'events.manage')`. Diese Suite hält die
 * ENTSCHEIDUNG fest, die dahinter steht — welche Site-Rolle Events verwalten
 * darf und dass der Silo unverändert bleibt.
 *
 * `events.manage` ist bewusst KEINE neue Capability: sie steht seit der
 * 5-Rollen-Matrix im EDITOR-Bündel (tenantAuthz.ts) — „Inhalte verfassen"
 * umfasst Beiträge, Seiten, Medien UND Events.
 */

beforeAll(() => {
  ;(globalThis as { createError?: (input: { status?: number, statusText?: string }) => Error }).createError
    = (input) => {
      const err = new Error(input.statusText ?? 'Error') as Error & { status?: number }
      err.status = input.status
      return err
    }
})

const allow = (role: TenantRole | null, labels: string[] = []) =>
  decideSiteAccess({ capability: 'events.manage', tenantScoped: true, role, labels })

describe('Events verwalten im Pool: die Site-Rolle entscheidet', () => {
  it('lässt Owner, Admin und Editor Events verwalten — ganz ohne globales Label', () => {
    for (const role of ['owner', 'admin', 'editor'] as const) {
      expect(allow(role), role).toEqual({ allowed: true, via: 'role', role })
    }
  })

  it('lässt Moderator und Viewer NICHT verwalten (moderieren ≠ verfassen)', () => {
    expect(allow('moderator')).toEqual({ allowed: false, reason: 'insufficient-role' })
    expect(allow('viewer')).toEqual({ allowed: false, reason: 'insufficient-role' })
  })

  it('weist ab, wer auf DIESER Site keine Rolle hat', () => {
    // Derselbe Mensch kann auf einer anderen Community Owner sein — hier zählt
    // nur die Mitgliedschaft, die der Aufrufer je Site auflöst.
    expect(allow(null)).toEqual({ allowed: false, reason: 'no-role' })
  })

  it('deckt die ganze Rollen-Matrix ab (neue Rolle ⇒ dieser Test bricht)', () => {
    const verdicts = Object.fromEntries(TENANT_ROLES.map(role => [role, allow(role).allowed]))
    expect(verdicts).toEqual({ owner: true, admin: true, editor: true, moderator: false, viewer: false })
  })
})

describe('Operator-Break-Glass bleibt der zweite Weg', () => {
  it('lässt das globale admin-Label auf eine Kunden-Site durch — protokolliert als operator', () => {
    expect(allow(null, ['admin'])).toEqual({ allowed: true, via: 'operator' })
  })

  it('meldet die Rolle, wenn der Betreiber ohnehin Mitglied ist (kein Fehlalarm im Log)', () => {
    expect(allow('owner', ['admin'])).toEqual({ allowed: true, via: 'role', role: 'owner' })
  })

  it('hilft dem globalen moderator-Label NICHT über events.manage', () => {
    expect(allow(null, ['moderator']).allowed).toBe(false)
  })
})

describe('Silo (comments-App): Verhalten unverändert', () => {
  it('verlangt ohne Mandanten-Kontext weiterhin das globale Operator-Label', () => {
    expect(decideSiteAccess({ capability: 'events.manage', tenantScoped: false, role: null, labels: ['admin'] }))
      .toEqual({ allowed: true, via: 'single-tenant' })
    expect(decideSiteAccess({ capability: 'events.manage', tenantScoped: false, role: null, labels: [] }))
      .toEqual({ allowed: false, reason: 'forbidden' })
  })

  it('öffnet ohne Mandanten NICHTS über eine mitgegebene Site-Rolle', () => {
    expect(decideSiteAccess({ capability: 'events.manage', tenantScoped: false, role: 'owner', labels: [] }).allowed)
      .toBe(false)
  })
})
