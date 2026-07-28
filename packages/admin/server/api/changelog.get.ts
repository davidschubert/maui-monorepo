import type { ChangelogListResponse } from '../../shared/types/admin'
import { compareChangelogByVersion, rowToChangelogEntry } from '../../shared/changelog'

const CATEGORIES = new Set(['feature', 'improvement', 'fix'])

/**
 * Öffentlich: veröffentlichte Changelog-Einträge — für den „Was ist neu"-Popover
 * UND die öffentliche /changelog-Seite. Paginiert (?page, ?limit≤50) mit
 * optionalem ?category-Filter; ohne Parameter wie bisher (20 neueste).
 * Sortierung nach Versionsnummer (in Code) → volles Set via Cursor-Pagination
 * (listAllChangelogRows), im Speicher paginieren.
 */
export default defineEventHandler(async (event): Promise<ChangelogListResponse> => {
  // N7 (Davids Entscheidung 2026-07-28): Betreiber-Changelog ≠ Mandanten-
  // Inhalt. Auf einem Mandanten-Host existiert diese Route nicht — 404 wie
  // ein unbekannter Pfad, damit die Antwort nichts über den Betreiber verrät.
  // Die AUTORITÄT sitzt hier, nicht in der Seite: ein $fetch auf
  // /api/changelog umgeht jedes Markup (dieselbe Logik wie beim
  // Registrierungs-Gate, s. assertTenantRegistrationOpen).
  // `useTenant(event)` ist der aufgelöste Kontext aus 00.tenant.ts:
  //   Mandanten-Host → gesetzt (Pool wie Silo) ⇒ gesperrt
  //   Kontroll-Host  → null (dort greift ohnehin 01.control-center.ts,
  //                    /api/changelog steht nicht in controlApiPrefixes)
  //   Silo-App ohne Tenant-Gate (comments) → null ⇒ unverändert erreichbar
  if (useTenant(event)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const query = getQuery(event)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))
  const page = Math.max(1, Number(query.page) || 1)
  const category = String(query.category ?? '')

  // Cross-Tenant-Cache-Regel (H3): auf tenancy-fähigen Apps trägt der Key den
  // Tenant, sonst leakt die Liste von Kunde A an Kunde B ('single' ohne Tenancy).
  const cacheKey = `${tenantCacheScope(event)}:${page}:${limit}:${category}`
  const cached = changelogCache.get(cacheKey)
  if (cached) return cached

  try {
    const { rows, total } = await listAllChangelogRows(event, {
      publishedOnly: true,
      category: CATEGORIES.has(category) ? category : undefined,
    })
    const all = rows.map(rowToChangelogEntry).sort(compareChangelogByVersion)
    const start = (page - 1) * limit
    const response = { total, entries: all.slice(start, start + limit) }
    changelogCache.set(cacheKey, response)
    return response
  }
  catch {
    return { total: 0, entries: [] }
  }
})
