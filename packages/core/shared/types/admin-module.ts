import type { Capability } from './authz'

/**
 * Admin-Modul, das ein Feature-Layer im Dashboard registriert
 * (app.config: `maui.admin.modules`, deep-merged über alle Layer). Das
 * Admin-Layout baut die Navigation daraus — so muss `admin` die Feature-
 * Sektionen NICHT hart kennen; ein neues Feature steckt sich nur „ein".
 *
 * Liegt in core (Fundament), damit Feature-Layer (comments, …) UND admin den
 * Vertrag nutzen, ohne sich gegenseitig zu importieren (Layer-Grenze A14).
 */
export interface MauiAdminModule {
  /** Stabile ID (key/Dedup) */
  id: string
  /** i18n-Key des Nav-Labels */
  labelKey: string
  /** Icon (i-ph-…) */
  icon: string
  /** Ziel-Pfad OHNE Locale-Prefix — das Layout wendet localePath() an */
  to: string
  /** Erforderliche Capability (RBAC-gefiltert) */
  requiredCapability: Capability
}
