import { describe, expect, it } from 'vitest'
import { capabilitiesFor } from '../../core/shared/authz'
import { TENANT_ROLES, tenantCapabilitiesFor, tenantRoleHasCapability } from '../../core/shared/tenantAuthz'

/**
 * S5 — die Kommentar-Moderation darf keine Nutzer-Verwaltung versprechen.
 *
 * /dashboard/comments verlangt `comments.moderate` (Site-Capability). Zwei
 * Elemente auf der Seite greifen aber in die NUTZER-Verwaltung:
 *   - „Autor sperren" → PATCH /api/admin/users/:id/status (`users.manage`)
 *   - der Autorname → /dashboard/users/:id (`requiredCapability: users.manage`)
 * Beide waren ungegated. Für einen Site-Moderator war der Knopf damit eine
 * Lüge: sichtbar, aber die Route weist ihn ab.
 *
 * Diese Suite hält die ENTSCHEIDUNG dahinter fest: die zwei Capabilities
 * fallen bewusst auseinander, deshalb braucht die Seite ein ZWEITES Gate.
 * Wandert `users.manage` je in eine Site-Rolle, bricht dieser Test — dann ist
 * die Entscheidung neu zu treffen, statt sie stillschweigend zu kippen.
 */

describe('Eintritt und Nutzer-Aktion sind nicht dieselbe Erlaubnis', () => {
  it('lässt Owner, Admin und Moderator moderieren', () => {
    for (const role of ['owner', 'admin', 'moderator'] as const) {
      expect(tenantRoleHasCapability(role, 'comments.moderate'), role).toBe(true)
    }
  })

  it('gibt KEINER Site-Rolle users.manage — auch dem Owner nicht', () => {
    const verdicts = Object.fromEntries(
      TENANT_ROLES.map(role => [role, tenantCapabilitiesFor(role).has('users.manage')]),
    )
    expect(verdicts).toEqual({ owner: false, admin: false, moderator: false, editor: false, viewer: false })
  })

  it('nennt damit mindestens eine Rolle, die auf die Seite darf und nicht sperren darf', () => {
    const gap = TENANT_ROLES.filter(role =>
      tenantRoleHasCapability(role, 'comments.moderate') && !tenantCapabilitiesFor(role).has('users.manage'))
    expect(gap).toEqual(['owner', 'admin', 'moderator'])
  })
})

describe('Nutzer-Verwaltung bleibt Betreiber-Sache (Operator-Labels)', () => {
  it('gibt users.manage nur dem globalen admin-Label', () => {
    expect(capabilitiesFor(['admin']).has('users.manage')).toBe(true)
    expect(capabilitiesFor(['moderator']).has('users.manage')).toBe(false)
    expect(capabilitiesFor([]).has('users.manage')).toBe(false)
  })
})
