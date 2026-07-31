import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { assertCourseAccess, enrollmentFor, registerCourseAccessGuard } from '../server/utils/courseAccess'
import type { CourseRow } from '../shared/types/course'

/**
 * Der DOKUMENTIERTE Zustand der Entitlement-gateten Paid-Kurse, festgenagelt
 * (Muster events/tests/event-tickets.test.ts, N5b).
 *
 * Paid-Kurse hängen an einem Guard, den die APP registriert
 * (registerCourseAccessGuard). Im SILO tut apps/comments genau das und ruft
 * darin billings Entitlements auf. Im POOL registriert HEUTE keine App einen
 * Guard — die platform-App bindet billing nicht ein, und Stripe stempelt
 * keinen Mandanten auf Abos. Daraus folgt: Paid-Kurse sind im Pool
 * FAIL-CLOSED (403), free/members laufen normal weiter.
 *
 * Kein Umbau, nur der Beweis, dass „fail-closed" wirklich fail-closed heißt
 * (und nicht versehentlich offen) — und dass der Lesepfad der Buchungen im
 * Pool zusätzlich am Mandanten hängt.
 */

interface EnrollmentRecord { $id: string, courseId: string, userId: string, tenantId?: string }

const enrollments: EnrollmentRecord[] = []

beforeAll(() => {
  const g = globalThis as Record<string, unknown>
  g.createError = (input: { status?: number, statusText?: string }) => {
    const err = new Error(input.statusText ?? 'Error') as Error & { status?: number }
    err.status = input.status
    return err
  }

  /**
   * Modell der Datentür (tenantDb `as: 'operator'`): `find` filtert die
   * mitgegebenen Query.equal-Bedingungen UND scopet IMMER zusätzlich auf den
   * Mandanten des Requests. Genau dieser implizite Scope ist der Grund, warum
   * eine ungestempelte Zeile im Pool nicht gefunden wird.
   */
  g.tenantDb = (event: H3Event) => ({
    find: async (_table: string, queries: string[]) => {
      const tenantId = (event.context as { tenant?: { tenantId?: string } }).tenant?.tenantId
      const conditions = queries
        .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
        .filter(c => c.method === 'equal')
      return enrollments.find(row =>
        conditions.every(c => (row as unknown as Record<string, unknown>)[c.attribute] === c.values[0])
        // Die Tür: im Pool zählt nur der EIGENE Mandant.
        && (tenantId ? row.tenantId === tenantId : true),
      ) ?? null
    },
  })
})

afterEach(() => {
  enrollments.length = 0
  registerCourseAccessGuard(async () => false)
})

const poolUser = { $id: 'u-1' }
const poolEvent = {
  context: { user: poolUser, tenant: { mode: 'pool', projectId: 'p', tenantId: 'kunde-a', communityId: 's-a' } },
} as unknown as H3Event
const siloEvent = { context: { user: poolUser } } as unknown as H3Event
const guestPoolEvent = {
  context: { tenant: { mode: 'pool', projectId: 'p', tenantId: 'kunde-a', communityId: 's-a' } },
} as unknown as H3Event

const paidCourse = { $id: 'c-1', access: 'paid', entitlementProduct: 'paidCourses' } as CourseRow
const freeCourse = { $id: 'c-2', access: 'free', entitlementProduct: null } as CourseRow
const membersCourse = { $id: 'c-3', access: 'members', entitlementProduct: null } as CourseRow

describe('Ohne registrierten Guard sind paid-Kurse zu (Pool-Zustand heute)', () => {
  it('wirft 403 — „not configured", nicht etwa ein stilles Ja', async () => {
    vi.resetModules()
    const fresh = await import('../server/utils/courseAccess')
    await expect(fresh.assertCourseAccess(poolEvent, paidCourse)).rejects.toMatchObject({ status: 403 })
  })

  it('lässt free- und members-Kurse davon unberührt', async () => {
    vi.resetModules()
    const fresh = await import('../server/utils/courseAccess')
    await expect(fresh.assertCourseAccess(poolEvent, freeCourse)).resolves.toBeUndefined()
    await expect(fresh.assertCourseAccess(poolEvent, membersCourse)).resolves.toBeUndefined()
  })
})

describe('Mit registriertem Guard entscheidet die App', () => {
  it('Guard sagt nein → 403 „Upgrade required"', async () => {
    registerCourseAccessGuard(async () => false)
    await expect(assertCourseAccess(poolEvent, paidCourse)).rejects.toMatchObject({ status: 403 })
  })

  it('ein werfender Guard zählt als nein (nie fail-open)', async () => {
    registerCourseAccessGuard(async () => { throw new Error('billing down') })
    await expect(assertCourseAccess(poolEvent, paidCourse)).rejects.toMatchObject({ status: 403 })
  })

  it('Guard sagt ja → frei (so verhält sich der Silo mit billing)', async () => {
    registerCourseAccessGuard(async () => true)
    await expect(assertCourseAccess(siloEvent, paidCourse)).resolves.toBeUndefined()
  })
})

describe('Gäste kommen nie an einen Kurs', () => {
  it('ohne Session → 401, noch vor jeder Guard-Frage', async () => {
    registerCourseAccessGuard(async () => true)
    await expect(assertCourseAccess(guestPoolEvent, freeCourse)).rejects.toMatchObject({ status: 401 })
  })
})

describe('Buchungen im Pool: nur der eigene Mandant zählt', () => {
  it('findet eine ungestempelte Buchung NICHT (fail-closed wie die Tickets)', async () => {
    enrollments.push({ $id: 'e-1', courseId: 'c-1', userId: 'u-1' })
    expect(await enrollmentFor(poolEvent, 'c-1', 'u-1')).toBeNull()
  })

  it('findet die GESTEMPELTE Buchung — der Scope ist die einzige Ursache', async () => {
    enrollments.push({ $id: 'e-2', courseId: 'c-1', userId: 'u-1', tenantId: 'kunde-a' })
    expect(await enrollmentFor(poolEvent, 'c-1', 'u-1')).toMatchObject({ $id: 'e-2' })
  })

  it('lässt die Buchung des NACHBARN nicht durch', async () => {
    enrollments.push({ $id: 'e-3', courseId: 'c-1', userId: 'u-1', tenantId: 'kunde-b' })
    expect(await enrollmentFor(poolEvent, 'c-1', 'u-1')).toBeNull()
  })

  it('Silo (comments-App): ohne Mandanten-Kontext gibt es nichts zu scopen', async () => {
    enrollments.push({ $id: 'e-4', courseId: 'c-1', userId: 'u-1' })
    expect(await enrollmentFor(siloEvent, 'c-1', 'u-1')).toMatchObject({ $id: 'e-4' })
  })
})
