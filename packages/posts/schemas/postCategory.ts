import { z } from 'zod'
import { MAX_CATEGORY_DESCRIPTION, MAX_CATEGORY_NAME, MAX_CATEGORY_SLUG } from '../shared/types/post'

/**
 * Kategorien der Discussions (F1 Stufe 1). Factory-Muster wie alle Schemas des
 * Repos: die UI übergibt `t`, der Server nimmt die Key-Fassung.
 *
 * ZWEI SCHEMAS, und das ist der Punkt: der Slug steht NUR im Anlege-Schema.
 * Der Kategorie-Name ist frei änderbar, der Slug nach der Anlage fest — die
 * Kategorie-SEITE (/discussions/<slug>) trägt keine Id, über die sich ein alter
 * Link selbst heilen könnte (dieselbe Regel wie beim pages-Layer). Ein
 * Alt-Slug-Gedächtnis wäre eine spätere Ausbaustufe, keine Stufe 1.
 */

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/** Kleinbuchstaben, Ziffern, Bindestrich als Trenner — kein führender/
 *  abschließender Bindestrich, keine Doppelungen. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Reservierte Slugs: `/discussions/<kategorie>` liegt im selben Namensraum wie
 * die Unterseiten des Bereichs. Ohne diese Sperre könnte eine Kategorie
 * „categories" die Kategorien-Übersicht verdecken.
 *
 * `about` und `badges` sind ECHTE Seiten des Bereichs — und `about` fehlte
 * hier seit Stufe 2 (beim Bau der Abzeichen-Seite aufgefallen). Ein statischer
 * Pfad gewinnt gegen `[category]`, die Kategorie wäre also nicht verdeckt,
 * sondern unerreichbar: sie ließe sich anlegen, in der Übersicht anklicken —
 * und der Klick landete auf der About-Seite. Die Sperre wirkt nur für NEUE
 * Kategorien; eine bestehende mit diesem Slug ist schon heute nicht
 * erreichbar und braucht einen neuen (Slug ist nach der Anlage fest).
 */
export const RESERVED_CATEGORY_SLUGS = ['categories', 'new', 'all', 'search', 'api', 'about', 'badges'] as const

const nameField = (t: TranslateFn) => z.string().trim()
  .min(1, t('posts.validation.categoryNameRequired'))
  .max(MAX_CATEGORY_NAME, t('posts.validation.categoryNameMax'))

const descriptionField = (t: TranslateFn) => z.string().trim()
  .max(MAX_CATEGORY_DESCRIPTION, t('posts.validation.categoryDescriptionMax'))
  .optional()

// 0–9999: die Reihenfolge ist eine Handvoll Kategorien, keine Sortier-Engine.
const sortOrderField = () => z.number().int().min(0).max(9999).optional()

export function createCategorySchema(t: TranslateFn = identity) {
  return z.object({
    name: nameField(t),
    slug: z.string().trim().toLowerCase()
      .min(1, t('posts.validation.categorySlugRequired'))
      .max(MAX_CATEGORY_SLUG, t('posts.validation.categorySlugMax'))
      .regex(SLUG_PATTERN, t('posts.validation.categorySlugFormat'))
      .refine(
        value => !(RESERVED_CATEGORY_SLUGS as readonly string[]).includes(value),
        t('posts.validation.categorySlugReserved'),
      ),
    description: descriptionField(t),
    sortOrder: sortOrderField(),
    active: z.boolean().optional(),
  })
}

/** Ändern: alles außer dem Slug. */
export function createCategoryEditSchema(t: TranslateFn = identity) {
  return z.object({
    name: nameField(t),
    description: descriptionField(t),
    sortOrder: sortOrderField(),
    active: z.boolean().optional(),
  })
}

// Server-seitige Instanzen (Fehlertexte = Keys; die UI validiert mit t())
export const categorySchema = createCategorySchema()
export const categoryEditSchema = createCategoryEditSchema()
