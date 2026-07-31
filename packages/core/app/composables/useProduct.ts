/**
 * Reaktiver Feature-Gate fürs UI (F2): true, solange das Feature nicht per
 * Laufzeit-Toggle abgeschaltet ist. Kein Registry-Check nötig — eine
 * Komponente aus Layer X existiert nur, wenn X einkompiliert ist.
 *
 * Reagiert live über den bestehenden Realtime-Config-Kanal (app_config-
 * Events → useRuntimeFlags), ohne Reload. NUR fürs Ausblenden — die
 * Autorität ist die Server-Middleware (feature-gate).
 */
import { isFeatureStateEnabled } from '../../shared/types/config'

export function useFeature(key: string) {
  const flags = useRuntimeFlags()
  return computed(() => isFeatureStateEnabled(flags.value.features[key]))
}
