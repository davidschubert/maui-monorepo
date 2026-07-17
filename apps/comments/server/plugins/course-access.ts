/**
 * A14-Komposition: verbindet courses (Access-Guard für 'paid'-Kurse) mit
 * billing (Entitlements) — die Layer kennen sich nicht, die APP schon.
 * Der Guard prüft das im Kurs deklarierte entitlementFeature gegen die
 * Features des aktiven Abos (getEntitledFeatures, §6: past_due zählt).
 */
export default defineNitroPlugin(() => {
  registerCourseAccessGuard(async (event, course) => {
    if (!course.entitlementFeature) return false
    const features = await getEntitledFeatures(event)
    return features.includes(course.entitlementFeature)
  })
})
