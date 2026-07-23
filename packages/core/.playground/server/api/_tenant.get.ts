/** Playground-Debug (dev-only App): macht den aufgelösten Tenant des Requests
 *  sichtbar — Beweis-Route des Horizont-3-Scharf-Dogfoods. */
export default defineEventHandler((event) => {
  return { tenant: useTenant(event) }
})
