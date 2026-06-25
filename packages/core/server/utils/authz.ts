/**
 * Re-Export der RBAC-Matrix (shared/authz) in den Server-Auto-Import-Scope —
 * damit Feature-Layer (z.B. admin) ROLES/Capabilities ohne tiefe Cross-Layer-
 * Pfade nutzen können. Siehe docs/RBAC-CONCEPT.md.
 */
export {
  ALL_CAPABILITIES,
  ROLES,
  ROLE_CAPABILITIES,
  capabilitiesFor,
  hasCapability,
  isRole,
} from '../../shared/authz'
