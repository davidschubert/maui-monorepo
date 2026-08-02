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
    stubCreateError()
    const event = { context: { user: { $id: 'u-1' } } }
    expect(isCourseAccessConfigured()).toBe(false)
    await expect(assertCourseAccess(
      event as never,
      { $id: 'c-1', access: 'paid', entitlementProduct: 'paidCourses' } as never,
    )).rejects.toMatchObject({ status: 403 })
  })
})

/** createError-Ersatz, der `data` MITNIMMT — daran hängt der ganze Befund. */
function stubCreateError() {
  const g = globalThis as Record<string, unknown>
  g.createError = (input: { status?: number, statusText?: string, data?: unknown }) => {
    const err = new Error(input.statusText ?? 'Error') as Error & { status?: number, data?: unknown }
    err.status = input.status
    err.data = input.data
    return err
  }
}

/**
 * DREI ABLEHNUNGEN, DREI GRÜNDE (Audit-Befund 2026-08-02).
 *
 * Die Kurs-Seite machte aus JEDEM 403 beim Einschreiben „Dieser Kurs gehört zu
 * Pro" samt Knopf auf /pricing. Im Pool zeigte der auf eine Seite, die es dort
 * nicht gibt (billing ist nicht eingebunden), und bei einer gesperrten
 * Community stand eine Kaufaufforderung neben der Mahnung des globalen
 * Hinweis-Plugins. Unterscheidbar sind die Fälle nur, wenn der Server einen
 * fachlichen Grund mitgibt — hier hängt er fest.
 */
describe('die Gründe sind unterscheidbar (Befund 1)', () => {
  it('kein Guard ⇒ course_paid_unavailable (dort gibt es nichts zu kaufen)', async () => {
    const { assertCourseAccess } = await freshCourseAccess()
    const { COURSE_PAID_UNAVAILABLE_CODE } = await import('../shared/types/course')
    stubCreateError()
    await expect(assertCourseAccess(
      { context: { user: { $id: 'u-1' } } } as never,
      { $id: 'c-1', access: 'paid', entitlementProduct: 'paidCourses' } as never,
    )).rejects.toMatchObject({ status: 403, data: { code: COURSE_PAID_UNAVAILABLE_CODE } })
  })

  it('Guard lehnt ab ⇒ course_upgrade_required (nur HIER hilft ein Upgrade)', async () => {
    const { assertCourseAccess, registerCourseAccessGuard } = await freshCourseAccess()
    const { COURSE_UPGRADE_REQUIRED_CODE } = await import('../shared/types/course')
    stubCreateError()
    registerCourseAccessGuard(async () => false)
    await expect(assertCourseAccess(
      { context: { user: { $id: 'u-1' } } } as never,
      { $id: 'c-1', access: 'paid', entitlementProduct: 'paidCourses' } as never,
    )).rejects.toMatchObject({ status: 403, data: { code: COURSE_UPGRADE_REQUIRED_CODE } })
  })

  it('die beiden Gründe sind nicht derselbe String', async () => {
    const { COURSE_PAID_UNAVAILABLE_CODE, COURSE_UPGRADE_REQUIRED_CODE } = await import('../shared/types/course')
    expect(COURSE_PAID_UNAVAILABLE_CODE).not.toBe(COURSE_UPGRADE_REQUIRED_CODE)
    // Der zentrale Fehler-Handler lässt nur kurze Schlüssel durch — ein Grund,
    // der dieses Muster verfehlt, käme im Browser NIE an (core/shared/types/error).
    for (const code of [COURSE_PAID_UNAVAILABLE_CODE, COURSE_UPGRADE_REQUIRED_CODE]) {
      expect(code).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
    }
  })
})

/**
 * SERVERSEITIG ABLEHNEN (Befund 2): der F13-Fix wirkte nur im Formular — über
 * die API entstand weiter ein Kurs, den anschließend niemand buchen kann.
 */
describe('assertPaidAccessOffered (Befund 2)', () => {
  it('kein Guard ⇒ 422 mit klarem Grund', async () => {
    const { assertPaidAccessOffered } = await freshCourseAccess()
    const { COURSE_PAID_UNAVAILABLE_CODE } = await import('../shared/types/course')
    stubCreateError()
    expect(() => assertPaidAccessOffered('paid')).toThrowError()
    try {
      assertPaidAccessOffered('paid')
    }
    catch (error) {
      expect(error).toMatchObject({ status: 422, data: { code: COURSE_PAID_UNAVAILABLE_CODE } })
    }
  })

  it('mit Guard geht paid durch', async () => {
    const { assertPaidAccessOffered, registerCourseAccessGuard } = await freshCourseAccess()
    stubCreateError()
    registerCourseAccessGuard(async () => true)
    expect(() => assertPaidAccessOffered('paid')).not.toThrow()
  })

  it('free/members sind nie betroffen', async () => {
    const { assertPaidAccessOffered } = await freshCourseAccess()
    stubCreateError()
    expect(() => assertPaidAccessOffered('free')).not.toThrow()
    expect(() => assertPaidAccessOffered('members')).not.toThrow()
  })

  it('beide Schreib-Routen rufen sie auf — sonst wirkt sie nur an einer Tür', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    expect(read('../server/api/courses/index.post.ts')).toContain('assertPaidAccessOffered(body.access)')
    // PATCH prüft den MERGED Zustand — sonst bliebe ein Bestandskurs unbemerkt
    // auf 'paid' stehen, wenn jemand nur den Titel ändert.
    expect(read('../server/api/courses/[slug]/index.patch.ts')).toContain('assertPaidAccessOffered(mergedAccess)')
  })
})
