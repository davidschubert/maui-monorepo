/**
 * Migration comments-018: Index `comments.idx_community_author_upvotes`
 * (F1 Stufe 4 — die Abzeichen fragen „wie viele MEINER Antworten haben
 * mindestens N Upvotes?").
 *
 * KEINE SPALTE, KEINE ZEILE, KEIN BACKFILL — diese Migration legt einen Index
 * an und sonst nichts. Sie ist damit auch vor dem Code-Deploy gefahrlos: ohne
 * die Abfrage kostet der Index nur ein wenig Platz.
 *
 * WARUM DIE BESTEHENDEN NICHT REICHEN: `author` (comments-003) trägt nur
 * `authorId` — ohne Mandant, also im Pool über ALLE Communities hinweg — und
 * `idx_community` (Zwilling aus comments-016) nur `communityId`. Die
 * Abzeichen-Abfrage filtert alle drei Spalten und läuft sechsmal (eine je
 * Schwelle) pro Aufruf der Galerie.
 *
 * `comment_votes` bekommt BEWUSST keinen eigenen Index: dort führt schon
 * `idx_community_user` (communityId, userId) die Abfrage, und der zusätzliche
 * Filter auf `value` trifft nur noch die Stimmen EINES Menschen in EINER
 * Community. Ein Index für den letzten Prozent-Punkt wäre eine Zeile, die
 * niemand mehr begründen kann.
 *
 * Idempotent (409 → skip). Index-Anlage NUR über die Fabrik (F19).
 *
 *   pnpm migrate --app <app> --layer comments
 */
import { Client, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'

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
const { indexStep } = createIndexSteps(tablesDB, databaseId)

const TABLE = 'comments'

console.log(`Migration comments-018 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

await indexStep(`Index ${TABLE}.idx_community_author_upvotes`, {
  tableId: TABLE, key: 'idx_community_author_upvotes', type: TablesDBIndexType.Key,
  columns: ['communityId', 'authorId', 'upvotes'],
})

console.log('✔ Migration comments-018 fertig')
