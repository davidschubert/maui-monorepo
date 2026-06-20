import type { AppConfig } from '../../shared/types/config'

/**
 * Öffentliche Laufzeit-Feature-Flags für den Client (z.B. Register-Gate).
 * Bewusst ohne Auth — die Flags sind nicht sensibel (Feature an/aus), und der
 * Server bleibt für jede Schreibaktion die eigentliche Autorität.
 */
export default defineEventHandler((event): Promise<AppConfig> => getAppConfig(event))
