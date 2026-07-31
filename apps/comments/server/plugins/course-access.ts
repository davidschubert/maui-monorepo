/**
 * A14-Komposition: verbindet courses (Access-Guard für 'paid'-Kurse) mit
 * billing (Entitlements) — die Layer kennen sich nicht, die APP schon.
 * Der Guard prüft das im Kurs deklarierte entitlementProduct gegen die
 * Produkte des aktiven Abos (getEntitledProducts, §6: past_due zählt).
 */
export default defineNitroPlugin(() => {
  registerCourseAccessGuard(async (event, course) => {
    if (!course.entitlementProduct) return false
    const products = await getEntitledProducts(event)
    return products.includes(course.entitlementProduct)
  })
})
