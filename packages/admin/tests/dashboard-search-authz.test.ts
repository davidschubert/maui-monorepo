import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasCapability } from '../../core/shared/authz'
import { decideSiteAccess } from '../../core/shared/siteAccess'
import { TENANT_ROLES, type TenantRole } from '../../core/shared/tenantAuthz'

/**
 * B7 — die Command-Palette (⌘K) verspricht nichts mehr, was die Zielroute
 * verweigert.
 *
 * Zwei Dinge waren falsch, und beide hängen zusammen:
 *  1. `/api/admin/search` gatete label-only mit `requirePermission
 *     (dashboard.access)`. Ein Kunden-Owner hat kein globales Label — die
 *     Palette lief für JEDES Site-Mitglied ins 403 (Klasse C1). Sobald der
 *     Gate die Mitgliedschaft belegt (`requireSitePermission`), tragen ihn
 *     ALLE fünf Site-Rollen, also auch `viewer` und `editor`.
 *  2. Jeder Kommentar-Treffer verlinkte auf `/dashboard/users/:autorId` —
 *     `users.manage`, das KEINE Site-Rolle trägt. Der Knopf führte ins 403.
 *
 * DAVIDS ENTSCHEIDUNG (2026-07-29): Kommentar-Treffer erscheinen nur mit
 * `comments.moderate` und führen per Deeplink in die Moderations-Warteschlange
 * (`/dashboard/comments?comment=<id>`) auf genau diesen Eintrag — wer suchen
 * darf, soll danach auch handeln können.
 *
 * Diese Suite nagelt beides fest: die ENTSCHEIDUNG (Rollen-Matrix), das
 * VERHALTEN der Route (Treffer/keine Treffer, echter Handler mit gestubbten
 * Auto-Imports) und das ZIEL des Treffers in der Palette.
 */

const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')

interface SearchResult {
  users: { $id: string, name: string, email: string }[]
  comments: { $id: string, content: string, authorId: string, authorName: string }[]
}

interface FakeTenant { mode: 'pool' | 'silo' }

interface RouteRun {
  result: SearchResult
  /** Wie oft die Kommentar-Tabelle überhaupt angefragt wurde. */
  commentQueries: number
  /** Wie oft die Users-API angefragt wurde. */
  userQueries: number
}

/**
 * Den ECHTEN Handler ausführen. `defineEventHandler` und die Nitro-Auto-Imports
 * sind zur Testzeit Globals — gestubbt ergibt `export default` schlicht die
 * Handler-Funktion. Damit prüft der Test die Route, nicht eine Nachbildung.
 */
async function runRoute(options: {
  role: TenantRole | null
  labels?: string[]
  tenant?: FakeTenant | null
  q?: string
}): Promise<RouteRun> {
  const { role, labels = [], tenant = { mode: 'pool' as const }, q = 'stein' } = options
  let commentQueries = 0
  let userQueries = 0

  vi.resetModules()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getQuery', () => ({ q }))
  vi.stubGlobal('hasCapability', hasCapability)
  vi.stubGlobal('useTenant', () => tenant)
  vi.stubGlobal('requireSitePermission', async () => ({
    user: { $id: 'user-1', labels },
    role,
  }))
  vi.stubGlobal('tenantDb', () => ({
    tenant,
    list: async () => {
      commentQueries += 1
      return {
        rows: [{
          $id: 'comment-1',
          content: 'Ein gemeldeter Kommentar',
          authorId: 'author-1',
          authorName: 'Autorin',
        }],
      }
    },
  }))
  vi.stubGlobal('createAdminClient', () => ({
    users: {
      list: async () => {
        userQueries += 1
        return { users: [{ $id: 'user-2', name: 'Bekannte', email: 'bekannte@example.test' }] }
      },
    },
  }))

  const module = await import('../server/api/admin/search.get')
  const handler = module.default as unknown as (event: unknown) => Promise<SearchResult>
  const result = await handler({})
  return { result, commentQueries, userQueries }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const moderate = (role: TenantRole | null, labels: string[] = []) =>
  decideSiteAccess({ capability: 'comments.moderate', tenantScoped: true, role, labels })

describe('Die Entscheidung: Kommentar-Treffer sind Moderations-Wissen', () => {
  it('gibt Owner, Admin und Moderator die Capability', () => {
    for (const role of ['owner', 'admin', 'moderator'] as const) {
      expect(moderate(role).allowed, role).toBe(true)
    }
  })

  it('hält Editor und Viewer davon fern — obwohl sie dashboard.access tragen', () => {
    for (const role of ['editor', 'viewer'] as const) {
      expect(decideSiteAccess({ capability: 'dashboard.access', tenantScoped: true, role, labels: [] }).allowed, role).toBe(true)
      expect(moderate(role)).toEqual({ allowed: false, reason: 'insufficient-role' })
    }
  })

  it('deckt die ganze Rollen-Matrix ab (neue Rolle ⇒ dieser Test bricht)', () => {
    const verdicts = Object.fromEntries(TENANT_ROLES.map(role => [role, moderate(role).allowed]))
    expect(verdicts).toEqual({ owner: true, admin: true, moderator: true, editor: false, viewer: false })
  })
})

describe('Die Route: mit comments.moderate kommen Treffer, ohne nicht', () => {
  it('liefert dem Moderator dieser Site Kommentar-Treffer', async () => {
    const { result, commentQueries } = await runRoute({ role: 'moderator' })
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0]?.$id).toBe('comment-1')
    expect(commentQueries).toBe(1)
  })

  it('liefert Owner und Admin ebenfalls Treffer', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const { result } = await runRoute({ role })
      expect(result.comments, role).toHaveLength(1)
    }
  })

  it('liefert Viewer und Editor KEINE Treffer — und fragt die Tabelle nicht einmal an', async () => {
    for (const role of ['viewer', 'editor'] as const) {
      const { result, commentQueries } = await runRoute({ role })
      expect(result.comments, role).toEqual([])
      expect(commentQueries, role).toBe(0)
    }
  })

  it('lässt den Betreiber per Break-Glass-Label durch (Support ohne Site-Rolle)', async () => {
    const { result } = await runRoute({ role: null, labels: ['moderator'] })
    expect(result.comments).toHaveLength(1)
  })

  it('bleibt bei Nutzer-Treffern im Pool leer (Audit B2 — unverändert)', async () => {
    const { result, userQueries } = await runRoute({ role: 'owner' })
    expect(result.users).toEqual([])
    expect(userQueries).toBe(0)
  })

  it('Silo/Einzelbetrieb: globales Label entscheidet, PII-Regel gilt weiter', async () => {
    const asModerator = await runRoute({ role: null, labels: ['moderator'], tenant: null })
    expect(asModerator.result.comments).toHaveLength(1)
    // moderator hat kein users.manage → Name ja, E-Mail nein
    expect(asModerator.result.users[0]?.email).toBe('')

    const asAdmin = await runRoute({ role: null, labels: ['admin'], tenant: null })
    expect(asAdmin.result.users[0]?.email).toBe('bekannte@example.test')
  })

  it('fragt unter zwei Zeichen gar nichts ab', async () => {
    const { result, commentQueries, userQueries } = await runRoute({ role: 'owner', q: 'a' })
    expect(result).toEqual({ users: [], comments: [] })
    expect(commentQueries + userQueries).toBe(0)
  })
})

describe('Die Route selbst: awaited Site-Gate statt label-only', () => {
  const routeSource = source('server/api/admin/search.get.ts')

  it('gatet mit await requireSitePermission(..., \'dashboard.access\')', () => {
    expect(routeSource).toContain(`await requireSitePermission(event, 'dashboard.access')`)
    // Das label-only `requirePermission` war der halbe Befund — es darf nicht
    // zurückkommen. `requireSitePermission` ist bewusst async: ein vergessenes
    // `await` wäre ein nicht abgewartetes Promise, also KEINE Prüfung.
    expect(routeSource).not.toMatch(/(?<!Site)requirePermission\(/)
    const calls = [...routeSource.matchAll(/(\w+\s+)?requireSitePermission\(/g)]
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call[1]?.trim()).toBe('await')
  })

  it('entscheidet die Kommentar-Treffer über decideSiteAccess(comments.moderate)', () => {
    expect(routeSource).toContain(`capability: 'comments.moderate'`)
    expect(routeSource).toContain('decideSiteAccess(')
  })
})

describe('Das Ziel des Treffers: Moderations-Warteschlange, nicht Nutzerseite', () => {
  const layout = source('app/layouts/dashboard.vue')

  it('verlinkt Kommentar-Treffer per Deeplink in die Warteschlange', () => {
    expect(layout).toContain(`localePath('/dashboard/comments')`)
    expect(layout).toContain('?comment=${encodeURIComponent(c.$id)}')
    // Der alte, für denselben Aufrufer verbotene Link darf nicht zurückkommen.
    expect(layout).not.toContain('/dashboard/users/${c.authorId}')
  })

  it('zeigt die Gruppen nur mit der Capability des Ziels (keine leere Überschrift)', () => {
    expect(layout).toContain('res.comments.length && canModerateComments.value')
    expect(layout).toContain('res.users.length && canManageUsers.value')
    // Doppelquelle wie in der Nav: Operator-Label ODER Site-Rolle.
    expect(layout).toContain(`can('comments.moderate')`)
  })
})

describe('Der Deeplink in der Warteschlange: ein Eintrag, sichtbar aufhebbar', () => {
  const page = readFileSync(
    fileURLToPath(new URL('../../comments/app/pages/dashboard/comments.vue', import.meta.url)),
    'utf8',
  )
  const listRoute = readFileSync(
    fileURLToPath(new URL('../../comments/server/api/admin/comments/index.get.ts', import.meta.url)),
    'utf8',
  )

  it('liest ?comment= aus der URL — dasselbe Muster wie ?status=', () => {
    expect(page).toContain(`route.query.comment`)
    expect(page).toContain('watch(() => route.query.comment')
  })

  it('hebt den Eintrag hervor und lässt ihn wieder loslassen', () => {
    expect(page).toContain('function clearFocus()')
    expect(page).toContain('data-moderation-focus')
    expect(page).toContain(':meta="tableMeta"')
  })

  it('führt die Liste serverseitig auf genau diese eine Zeile (durch die Datentür)', () => {
    expect(listRoute).toContain(`String(query.comment ?? '').trim()`)
    expect(listRoute).toContain(`Query.equal('$id', [focusId])`)
    // Kein roher tablesDB-Zugriff — der Fokus geht durch dieselbe Tür wie die Liste.
    expect(listRoute).not.toContain('.tablesDB')
  })
})
