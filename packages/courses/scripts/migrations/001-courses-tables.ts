/**
 * Migration courses-001: courses + lessons + enrollments + lesson_progress
 * (Phase 24). Writes AUSSCHLIESSLICH server-seitig (Builder-Routen mit
 * courses.manage bzw. Enroll/Progress via Admin-Client) — Tables ohne
 * User-Schreibrechte; published-Kurse tragen Row-read(users) (Kurse sind
 * ein Mitglieder-Katalog, kein Gast-Content). Idempotent (409 → skip).
 *
 *   pnpm migrate --app <app> --layer courses
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    if (columns.length > 0 && columns.every(c => c.status === 'available')) return
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}
async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}
async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

console.log(`Migration courses-001 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await step('Table courses', () => tablesDB.createTable({
  databaseId, tableId: 'courses', name: 'Courses', permissions: [], rowSecurity: true,
}))
const c = await existingColumnKeys('courses')
await columnStep('Column courses.title', 'title', c, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'courses', key: 'title', size: 200, required: true }))
await columnStep('Column courses.slug', 'slug', c, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'courses', key: 'slug', size: 100, required: true }))
await columnStep('Column courses.description', 'description', c, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'courses', key: 'description', size: 5000, required: true }))
await columnStep('Column courses.status', 'status', c, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'courses', key: 'status', size: 12, required: true }))
await columnStep('Column courses.access', 'access', c, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'courses', key: 'access', size: 8, required: true }))
await columnStep('Column courses.entitlementFeature', 'entitlementFeature', c, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'courses', key: 'entitlementFeature', size: 64, required: false }))
await columnStep('Column courses.authorId', 'authorId', c, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'courses', key: 'authorId', size: 36, required: true }))
await columnStep('Column courses.authorName', 'authorName', c, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'courses', key: 'authorName', size: 255, required: false, xdefault: '' }))
await columnStep('Column courses.lessonCount', 'lessonCount', c, () => tablesDB.createIntegerColumn({ databaseId, tableId: 'courses', key: 'lessonCount', required: false, min: 0, xdefault: 0 }))

await step('Table lessons', () => tablesDB.createTable({
  databaseId, tableId: 'lessons', name: 'Lessons', permissions: [], rowSecurity: true,
}))
const l = await existingColumnKeys('lessons')
await columnStep('Column lessons.courseId', 'courseId', l, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'lessons', key: 'courseId', size: 36, required: true }))
await columnStep('Column lessons.title', 'title', l, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'lessons', key: 'title', size: 200, required: true }))
await columnStep('Column lessons.order', 'order', l, () => tablesDB.createIntegerColumn({ databaseId, tableId: 'lessons', key: 'order', required: true, min: 0 }))
await columnStep('Column lessons.content', 'content', l, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'lessons', key: 'content', size: 15000, required: true }))
await columnStep('Column lessons.videoUrl', 'videoUrl', l, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'lessons', key: 'videoUrl', size: 500, required: false }))
await columnStep('Column lessons.status', 'status', l, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'lessons', key: 'status', size: 12, required: true }))

await step('Table enrollments', () => tablesDB.createTable({
  databaseId, tableId: 'enrollments', name: 'Enrollments', permissions: [], rowSecurity: true,
}))
const e = await existingColumnKeys('enrollments')
await columnStep('Column enrollments.courseId', 'courseId', e, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'enrollments', key: 'courseId', size: 36, required: true }))
await columnStep('Column enrollments.userId', 'userId', e, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'enrollments', key: 'userId', size: 36, required: true }))
await columnStep('Column enrollments.completedAt', 'completedAt', e, () => tablesDB.createDatetimeColumn({ databaseId, tableId: 'enrollments', key: 'completedAt', required: false }))

await step('Table lesson_progress', () => tablesDB.createTable({
  databaseId, tableId: 'lesson_progress', name: 'Lesson Progress', permissions: [], rowSecurity: true,
}))
const p = await existingColumnKeys('lesson_progress')
await columnStep('Column lesson_progress.lessonId', 'lessonId', p, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'lesson_progress', key: 'lessonId', size: 36, required: true }))
await columnStep('Column lesson_progress.courseId', 'courseId', p, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'lesson_progress', key: 'courseId', size: 36, required: true }))
await columnStep('Column lesson_progress.userId', 'userId', p, () => tablesDB.createVarcharColumn({ databaseId, tableId: 'lesson_progress', key: 'userId', size: 36, required: true }))
await columnStep('Column lesson_progress.completedAt', 'completedAt', p, () => tablesDB.createDatetimeColumn({ databaseId, tableId: 'lesson_progress', key: 'completedAt', required: true }))

await waitForColumns('courses')
await waitForColumns('lessons')
await waitForColumns('enrollments')
await waitForColumns('lesson_progress')

await step('Index courses.uq_slug', () => tablesDB.createIndex({ databaseId, tableId: 'courses', key: 'uq_slug', type: TablesDBIndexType.Unique, columns: ['slug'] }))
await step('Index courses.idx_status', () => tablesDB.createIndex({ databaseId, tableId: 'courses', key: 'idx_status', type: TablesDBIndexType.Key, columns: ['status'] }))
await step('Index lessons.idx_course_order', () => tablesDB.createIndex({ databaseId, tableId: 'lessons', key: 'idx_course_order', type: TablesDBIndexType.Key, columns: ['courseId', 'order'] }))
await step('Index enrollments.uq_course_user', () => tablesDB.createIndex({ databaseId, tableId: 'enrollments', key: 'uq_course_user', type: TablesDBIndexType.Unique, columns: ['courseId', 'userId'] }))
await step('Index enrollments.idx_user', () => tablesDB.createIndex({ databaseId, tableId: 'enrollments', key: 'idx_user', type: TablesDBIndexType.Key, columns: ['userId'] }))
await step('Index lesson_progress.uq_lesson_user', () => tablesDB.createIndex({ databaseId, tableId: 'lesson_progress', key: 'uq_lesson_user', type: TablesDBIndexType.Unique, columns: ['lessonId', 'userId'] }))
await step('Index lesson_progress.idx_user', () => tablesDB.createIndex({ databaseId, tableId: 'lesson_progress', key: 'idx_user', type: TablesDBIndexType.Key, columns: ['userId'] }))
await step('Index lesson_progress.idx_course_user', () => tablesDB.createIndex({ databaseId, tableId: 'lesson_progress', key: 'idx_course_user', type: TablesDBIndexType.Key, columns: ['courseId', 'userId'] }))

console.log('✔ Migration courses-001 fertig')
