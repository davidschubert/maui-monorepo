import products from './products.get'

/**
 * Übergangs-Alias (E11, bis zum Zusammenziehen): die alte öffentliche Route
 * des Produkt-Snapshots. Ein Control Plane von VOR dem Rename pollt sie im
 * Health-Sweep und erwartet { features } — und der neue Health-Sweep nutzt
 * sie als Fallback für Silo-Apps, die per Update-Welle nachziehen.
 * Fällt mit der Aufräum-Migration weg.
 */
export default defineEventHandler(async (event) => {
  const snapshot = await products(event)
  return { features: snapshot.products }
})
