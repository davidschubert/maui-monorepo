import { LESSONS_TABLE, type LessonRow } from '../../../shared/types/course'

/**
 * Lektion löschen (courses.manage) — lessonCount wird nachgezogen. Datentür
 * als Operator: get/remove belegen die Zugehörigkeit VOR dem Löschen.
 *
 * WER HANDELT (F17): Redaktion an INHALT — `actor` aus dem Gate. LÖSCHEN zählt
 * mit, und zwar nach dem Vorbild der Beitrags-Löschung durch den Autor (C1c):
 * die Sperre heißt „nur-lesend", nicht „nur nichts Neues". Eine Bibliothek, aus
 * der während des Zahlungsverzugs Lektionen verschwinden, ist nicht mehr die,
 * die die Mitglieder gebucht haben.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const { actor } = await requireCommunityPermission(event, 'courses.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing lesson id' })
  }

  const db = tenantDb(event, { as: 'operator', actor })
  const row = await db.get<LessonRow>(LESSONS_TABLE, id, 'Lesson not found')

  await db.remove(LESSONS_TABLE, id, 'Lesson not found').catch((error) => {
    throw toH3Error(error, 'Could not delete lesson')
  })

  await syncLessonCount(event, row.courseId)

  return { ok: true }
})
