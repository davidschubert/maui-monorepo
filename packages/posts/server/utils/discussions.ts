import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { discussionTopicPath, topicSlug } from '../../shared/discussionUrl'
import {
  POST_CATEGORIES_TABLE,
  POSTS_TABLE,
  type CommunityPost,
  type DiscussionTopic,
  type PostCategory,
} from '../../shared/types/post'

/**
 * Gemeinsamer Unterbau der Discussions-Routen (F1 Stufe 1).
 *
 * Liegt in `server/utils/**` und geht trotzdem ausschließlich über
 * `tenantDb(event)` — die Datentür ist hier kein ESLint-Zwang (der greift nur
 * in `server/api/**` und `server/plugins/**`), sondern dieselbe Regel aus
 * eigener Einsicht: diese Funktionen bekommen einen H3Event, bedienen also
 * einen Request und gehören hinter dieselbe Grenze wie eine Route.
 */

/**
 * Obergrenze der Kategorien je Community.
 *
 * 100 ist keine Produkt-Entscheidung, sondern die Grenze von `Query.equal`
 * (100 Werte) und die Zahl der Count-Abfragen, die die Kategorien-Ansicht
 * höchstens auslöst. Eine Community mit mehr als hundert Kategorien hat kein
 * Struktur-, sondern ein Ordnungsproblem — und würde es hier bemerken.
 */
export const MAX_CATEGORIES = 100

/**
 * Die gewählte Kategorie prüfen und ihre Row-Id zurückgeben ('' = keine).
 *
 * DREI Prüfungen, jede mit eigenem Grund:
 *  - existiert sie? (`get` wirft 404 für Unbekanntes)
 *  - gehört sie DIESEM Mandanten? — das belegt die Datentür, nicht diese
 *    Funktion; ohne sie könnte ein durchgereichter Body einen Beitrag in die
 *    Struktur einer fremden Community hängen.
 *  - ist sie aktiv? Eine stillgelegte Kategorie nimmt keine NEUEN Beiträge
 *    mehr auf — genau das ist der Sinn des Schalters. Bestand bleibt.
 *
 * 422 statt 404: der Beitrag selbst ist in Ordnung, nur eine seiner Angaben
 * nicht. Der fachliche Schlüssel reist als `data.code` und kommt beim Client
 * als `reason` an (core/server/error.ts).
 */
export async function resolveCategoryId(event: H3Event, categoryId: string | undefined): Promise<string> {
  const wanted = categoryId?.trim() ?? ''
  if (!wanted) return ''

  const category = await tenantDb(event)
    .get<PostCategory>(POST_CATEGORIES_TABLE, wanted, 'Category not found')
    .catch(() => null)

  if (!category || !category.active) {
    throw createError({
      status: 422,
      statusText: 'Unknown category',
      data: { code: 'category_unknown' },
    })
  }
  return category.$id
}

/** Alle Kategorien der Community, sortiert wie sie angezeigt werden. */
export async function listCategories(
  event: H3Event,
  options: { activeOnly?: boolean } = {},
): Promise<PostCategory[]> {
  const { rows } = await tenantDb(event).list<PostCategory>(POST_CATEGORIES_TABLE, [
    ...(options.activeOnly ? [Query.equal('active', true)] : []),
    Query.orderAsc('sortOrder'),
    Query.orderAsc('name'),
    Query.limit(MAX_CATEGORIES),
  ])
  return rows
}

/**
 * Anzahl veröffentlichter Topics je Kategorie.
 *
 * EINE Abfrage JE Kategorie — Appwrite kann nicht gruppieren, und eine
 * denormalisierte Zähler-Spalte wäre neue Infrastruktur (samt der Frage, wer
 * sie beim Ausblenden, Löschen und Umkategorisieren nachzieht). Bei ≤100
 * Kategorien sind das ≤100 `count`-Abfragen, und sie laufen nur dort, wo die
 * Zahl auch angezeigt wird (Kategorien-Ansicht, Verwaltung) — nie auf der
 * Topic-Liste.
 */
export async function topicCountsFor(event: H3Event, categories: PostCategory[]): Promise<Map<string, number>> {
  const db = tenantDb(event)
  const counts = await Promise.all(categories.map(category =>
    db.count(POSTS_TABLE, [
      Query.equal('categoryId', category.$id),
      Query.equal('status', 'published'),
    ]).catch(() => 0),
  ))
  return new Map(categories.map((category, index) => [category.$id, counts[index] ?? 0]))
}

/**
 * Anzeigetitel eines Topics: der Titel, sonst der Anfang des Textes.
 *
 * Serverseitig, nicht in der Tabelle: Umfragen und Fragen tragen ihre Frage
 * oft nur im `body` (CommunityPost.title ist bewusst optional). Ohne diesen
 * Rückfall stünde in der Topic-Spalte eine leere Zelle — und die Oberfläche
 * müsste dieselbe Regel ein zweites Mal kennen.
 */
export function topicTitle(row: Pick<CommunityPost, 'title' | 'body'>): string {
  const title = row.title?.trim()
  if (title) return title
  const text = row.body.trim().replace(/\s+/g, ' ')
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

/** Eine Beitrags-Zeile in die schlanke Listen-Form bringen. */
export function toDiscussionTopic(
  row: CommunityPost,
  category: PostCategory,
  avatarUrl: string | undefined,
): DiscussionTopic {
  const slug = topicSlug(row.title, row.body)
  return {
    $id: row.$id,
    title: topicTitle(row),
    slug,
    path: discussionTopicPath(category.slug, row.$id, slug),
    authorId: row.authorId,
    authorName: row.authorName,
    authorAvatarUrl: avatarUrl,
    categoryId: category.$id,
    categoryName: category.name,
    categorySlug: category.slug,
    score: row.score,
    publishedAt: row.publishedAt,
    // Siehe DiscussionTopic.lastActivityAt: Antworten bewegen diesen Wert in
    // Stufe 1 NICHT (sie liegen im comments-Layer, A14).
    lastActivityAt: row.$updatedAt,
  }
}
