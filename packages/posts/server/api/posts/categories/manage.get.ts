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

  const categories = await listCategories(event)
  const counts = await topicCountsFor(event, categories)
  return { rows: categories.map(category => ({ category, topicCount: counts.get(category.$id) ?? 0 })) }
})
