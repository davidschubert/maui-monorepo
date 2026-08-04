import type { CategoryListResponse } from '../../../../shared/types/post'

/**
 * Kategorien für die VERWALTUNG: alle (auch stillgelegte), immer mit
 * Topic-Anzahl — die Zahl ist dort keine Deko, sondern die Antwort auf „darf
 * ich das löschen?" (die DELETE-Route verweigert bei belegten Kategorien).
 *
 * Eigene Route statt eines Query-Flags auf der öffentlichen Liste: die
 * Berechtigungs-Prüfung soll am Pfad hängen und nicht an einem Parameter, den
 * jemand später versehentlich durchreicht.
 */
export default defineEventHandler(async (event): Promise<CategoryListResponse> => {
  requirePlanProduct(event, 'posts')
  await requireCommunityPermission(event, 'posts.manage')

  // Lesen bleibt die Mitglieder-Klinke: die Verwaltung braucht keinen
  // Admin-Client, um die eigenen Kategorien zu sehen.
  const db = tenantDb(event)
  const categories = await listCategories(db)
  const counts = await topicCountsFor(db, categories)
  return { rows: categories.map(category => ({ category, topicCount: counts.get(category.$id) ?? 0 })) }
})
