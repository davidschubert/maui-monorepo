import type { CategoryListResponse } from '../../../../shared/types/post'

/**
 * Die Kategorien dieser Community — öffentlich lesbar (Gäste sehen die
 * Struktur, wie sie den Feed sehen; wer welche ZEILE bekommt, entscheidet
 * ohnehin die Row-Permission, C18).
 *
 * `?counts=1` hängt die Anzahl veröffentlichter Topics an. BEWUSST optional:
 * das kostet eine Abfrage je Kategorie und wird nur von der Kategorien-Ansicht
 * gebraucht — der Composer und die Seitenleiste brauchen nur die Namen.
 *
 * `?all=1` nimmt auch stillgelegte Kategorien mit. Das ist KEIN Leck: eine
 * stillgelegte Kategorie ist nicht geheim, sie ist nur aus der Auswahl
 * genommen — ihre Bestands-Topics bleiben sichtbar und brauchen den Namen für
 * die Anzeige. Die Verwaltungs-Route (`manage.get.ts`) ist trotzdem eine
 * eigene: sie steht hinter `posts.manage`, weil dort GESCHRIEBEN wird.
 */
export default defineEventHandler(async (event): Promise<CategoryListResponse> => {
  // Produkt-Gate (P4): Discussions sitzt auf `posts` — siehe product.manifest.ts.
  requirePlanProduct(event, 'posts')

  const query = getQuery(event)
  const categories = await listCategories(event, { activeOnly: query.all !== '1' })

  if (query.counts !== '1') {
    return { rows: categories.map(category => ({ category, topicCount: 0 })) }
  }

  const counts = await topicCountsFor(event, categories)
  return { rows: categories.map(category => ({ category, topicCount: counts.get(category.$id) ?? 0 })) }
})
