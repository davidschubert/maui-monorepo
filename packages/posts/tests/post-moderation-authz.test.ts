import { describe, expect, it } from 'vitest'
import { decideSiteAccess } from '../../core/shared/siteAccess'
import { TENANT_ROLES, type TenantRole } from '../../core/shared/tenantAuthz'

/**
 * S1 — die Posts-Moderation hängt nicht mehr an globalen Operator-Labels.
 *
 * `posts.moderate` steht seit der 5-Rollen-Matrix im MODERATOR-Bündel
 * (tenantAuthz.ts) und die Seite /dashboard/posts verlangt genau diese
 * Capability. Die vier Routen (moderation.get, [id]/hide, [id]/restore,
 * [id]/assist) prüften sie trotzdem label-only mit `requirePermission` —
 * ein Site-Moderator kam auf die Seite und lief bei jedem Klick in ein 403,
 * und ein Operator-Zugriff erzeugte keinen `site.operator_access`-Eintrag.
 *
 * Diese Suite hält die ENTSCHEIDUNG fest, die hinter der Umstellung auf
 * `await requireSitePermission(event, 'posts.moderate')` steht.
 */

const allow = (role: TenantRole | null, labels: string[] = []) =>
  decideSiteAccess({ capability: 'posts.moderate', tenantScoped: true, role, labels })

describe('Posts moderieren im Pool: die Site-Rolle entscheidet', () => {
  it('lässt Owner, Admin und Moderator moderieren — ganz ohne globales Label', () => {
    for (const role of ['owner', 'admin', 'moderator'] as const) {
      expect(allow(role), role).toEqual({ allowed: true, via: 'role', role })
    }
  })

  it('lässt Editor und Viewer NICHT moderieren (verfassen ≠ moderieren)', () => {
    expect(allow('editor')).toEqual({ allowed: false, reason: 'insufficient-role' })
    expect(allow('viewer')).toEqual({ allowed: false, reason: 'insufficient-role' })
  })

  it('weist ab, wer auf DIESER Site keine Rolle hat', () => {
    expect(allow(null)).toEqual({ allowed: false, reason: 'no-role' })
  })

  it('deckt die ganze Rollen-Matrix ab (neue Rolle ⇒ dieser Test bricht)', () => {
    const verdicts = Object.fromEntries(TENANT_ROLES.map(role => [role, allow(role).allowed]))
    expect(verdicts).toEqual({ owner: true, admin: true, moderator: true, editor: false, viewer: false })
  })
})

describe('Operator-Break-Glass bleibt der zweite Weg — und wird protokolliert', () => {
  it('lässt das globale admin-Label auf eine Kunden-Site durch, gemeldet als operator', () => {
    expect(allow(null, ['admin'])).toEqual({ allowed: true, via: 'operator' })
  })

  it('hilft dem globalen moderator-Label NICHT über posts.moderate', () => {
    // Bewusste Asymmetrie im Bestand: die SITE-Rolle `moderator` hält
    // posts.moderate, das OPERATOR-Label `moderator` nicht (authz.ts kennt dort
    // nur comments/reports/tickets). Die Umstellung auf requireSitePermission
    // ändert daran nichts — sie hält den Zustand nur fest.
    expect(allow(null, ['moderator'])).toEqual({ allowed: false, reason: 'no-role' })
  })

  it('meldet die Rolle, wenn der Betreiber ohnehin Mitglied ist (kein Fehlalarm im Log)', () => {
    expect(allow('moderator', ['admin'])).toEqual({ allowed: true, via: 'role', role: 'moderator' })
  })
})

describe('Silo (comments-App): Verhalten unverändert', () => {
  it('verlangt ohne Mandanten-Kontext weiterhin das globale admin-Label', () => {
    expect(decideSiteAccess({ capability: 'posts.moderate', tenantScoped: false, role: null, labels: ['admin'] }))
      .toEqual({ allowed: true, via: 'single-tenant' })
    expect(decideSiteAccess({ capability: 'posts.moderate', tenantScoped: false, role: null, labels: ['moderator'] }))
      .toEqual({ allowed: false, reason: 'forbidden' })
    expect(decideSiteAccess({ capability: 'posts.moderate', tenantScoped: false, role: null, labels: [] }))
      .toEqual({ allowed: false, reason: 'forbidden' })
  })

  it('öffnet ohne Mandanten NICHTS über eine mitgegebene Site-Rolle', () => {
    expect(decideSiteAccess({ capability: 'posts.moderate', tenantScoped: false, role: 'owner', labels: [] }).allowed)
      .toBe(false)
  })
})
