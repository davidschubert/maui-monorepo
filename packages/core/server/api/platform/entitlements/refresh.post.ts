import { runEntitlementsPull } from '../../../utils/entitlementsPull'

/**
 * Entitlement-Pull manuell auslösen (system.manage) — Ops-Griff neben dem
 * 15-min-Intervall (entitlements-pull-Plugin), z. B. direkt nach einer
 * Grant-Änderung im Control Plane.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  return await runEntitlementsPull(event)
})
