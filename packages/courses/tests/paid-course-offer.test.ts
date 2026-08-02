import { describe, expect, it, vi } from 'vitest'

/**
 * F13-Muster für Kurse: das Dashboard-Formular bietet 'paid' nur an, wo ein
 * Access-Guard registriert ist.
 *
 * Die Frage wird bewusst NICHT über eine Config beantwortet, sondern über
 * denselben Zustand, den `assertCourseAccess` beim Buchen liest
 * (`isCourseAccessConfigured`) — zwei Quellen könnten auseinanderlaufen, und
 * dann stünde die Option wieder vor einer Tür, die 403 sagt.
 *
 * Frische Modul-Instanz je Fall (`vi.resetModules`), weil der Guard
 * MODUL-Zustand ist: der unregistrierte Ausgangszustand lässt sich sonst nach
 * dem ersten register-Aufruf nicht mehr herstellen.
 */
async function freshCourseAccess() {
  vi.resetModules()
  return import('../server/utils/courseAccess')
}

describe('isCourseAccessConfigured (F13-Muster)', () => {
  it('Pool: ohne registrierten Guard ist paid nicht anbietbar', async () => {
    const { isCourseAccessConfigured } = await freshCourseAccess()
    expect(isCourseAccessConfigured()).toBe(false)
  })

  it('Silo: mit registriertem Guard ist paid anbietbar', async () => {
    const { isCourseAccessConfigured, registerCourseAccessGuard } = await freshCourseAccess()
    registerCourseAccessGuard(async () => true)
    expect(isCourseAccessConfigured()).toBe(true)
  })

  it('sagt dasselbe wie der Buchen-Pfad: kein Guard ⇒ 403 auf paid', async () => {
    const { assertCourseAccess, isCourseAccessConfigured } = await freshCourseAccess()
    const g = globalThis as Record<string, unknown>
    g.createError = (input: { status?: number, statusText?: string }) => {
      const err = new Error(input.statusText ?? 'Error') as Error & { status?: number }
      err.status = input.status
      return err
    }
    const event = { context: { user: { $id: 'u-1' } } }
    expect(isCourseAccessConfigured()).toBe(false)
    await expect(assertCourseAccess(
      event as never,
      { $id: 'c-1', access: 'paid', entitlementProduct: 'paidCourses' } as never,
    )).rejects.toMatchObject({ status: 403 })
  })
})
