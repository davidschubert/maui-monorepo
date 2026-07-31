import { AppwriteException } from 'node-appwrite'
import { z } from 'zod'
import type { ProductRuntimeState } from '../../../../../core/shared/types/config'

const bodySchema = z.object({ enabled: z.boolean() })

/**
 * Laufzeit-Produkt-Toggle (F2/M2): schreibt app_config.products (system-018).
 * Guards: nur einkompilierte optional-Tier-Produkte; Abschalten wird
 * verweigert, solange AKTIVE Produkte es via requires brauchen
 * (moderation ← comments); Anschalten verlangt aktive Abhängigkeiten.
 * Statusmaschine M2: enabled ⇔ active/inactive — provisioning/error kommen
 * mit dem Provisioner (M3/M7).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const key = getRouterParam(event, 'key')
  const { enabled } = await readValidatedBody(event, bodySchema.parse)

  const manifest = key ? getProductRegistry().get(key) : undefined
  if (!key || !manifest) {
    throw createError({ status: 404, statusText: 'Unknown product' })
  }
  if (manifest.tier !== 'optional') {
    throw createError({ status: 409, statusText: 'Foundation products cannot be toggled' })
  }

  const states = await getEffectiveProducts(event)

  if (!enabled) {
    const requiredBy = [...getProductRegistry().values()]
      .filter(m => m.requires?.includes(key) && (states[m.key]?.enabled ?? true))
      .map(m => m.key)
    if (requiredBy.length > 0) {
      throw createError({ status: 409, statusText: `Required by: ${requiredBy.join(', ')}` })
    }
  }
  if (enabled) {
    const missing = (manifest.requires ?? []).filter(req => !(states[req]?.enabled ?? true))
    if (missing.length > 0) {
      throw createError({ status: 409, statusText: `Requires: ${missing.join(', ')}` })
    }
  }

  const next: Record<string, ProductRuntimeState> = {
    ...states,
    [key]: { enabled, status: enabled ? 'active' : 'inactive' },
  }
  // Nur echte Overrides persistieren — Default (an/active) bleibt implizit,
  // damit die Spalte klein bleibt und neue Produkte automatisch AN sind.
  const overrides = Object.fromEntries(
    Object.entries(next).filter(([, state]) => !(state.enabled && state.status === 'active')),
  )
  // Übergang bis zum Zusammenziehen (E11): die alte Spalte `features` wird
  // MITgeschrieben, damit ein Rollback auf den Vor-Rename-Stand dieselben
  // Gates sieht. Fällt mit der Aufräum-Migration weg.
  const serialized = JSON.stringify(overrides)
  const data = { products: serialized, features: serialized }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  try {
    await admin.tablesDB.updateRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
  }
  catch (error) {
    // NUR wenn die Zeile fehlt anlegen — andere Fehler nicht verschlucken
    if (error instanceof AppwriteException && error.code === 404) {
      await admin.tablesDB.createRow({ databaseId, tableId: 'app_config', rowId: 'global', data })
        .catch(e => { throw toH3Error(e, 'Could not update products') })
    }
    else {
      throw toH3Error(error, 'Could not update products')
    }
  }

  invalidateProductGateCache()

  await recordAudit(event, {
    action: enabled ? 'product.enabled' : 'product.disabled',
    targetType: 'product',
    targetId: key,
  })

  return { key, enabled }
})
