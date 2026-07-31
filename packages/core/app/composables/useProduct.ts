/**
 * Reaktiver Produkt-Gate fürs UI (F2): true, solange das Produkt nicht per
 * Laufzeit-Toggle abgeschaltet ist. Kein Registry-Check nötig — eine
 * Komponente aus Layer X existiert nur, wenn X einkompiliert ist.
 *
 * Reagiert live über den bestehenden Realtime-Config-Kanal (app_config-
 * Events → useRuntimeFlags), ohne Reload. NUR fürs Ausblenden — die
 * Autorität ist die Server-Middleware (product-gate).
 */
import { isProductStateEnabled } from '../../shared/types/config'

export function useProduct(key: string) {
  const flags = useRuntimeFlags()
  return computed(() => isProductStateEnabled(flags.value.products[key]))
}
