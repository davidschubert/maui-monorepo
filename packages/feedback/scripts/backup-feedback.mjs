#!/usr/bin/env node
/**
 * Sicherung des ALTEN Silo-Feedbacks vor dem Layer-Umzug (E10, Davids
 * Entscheidungen 6+7 in docs/plans/CUSTOMER-FEEDBACK.md).
 *
 * Entscheidung 6 sagt: die Zeilen in `apps/comments` sind Rückmeldungen zu
 * EINER Installation, kein Produkt-Feedback zur Plattform — sie werden NICHT
 * migriert und NICHT gelöscht. Entscheidung 7 nimmt der App aber im selben Zug
 * die Ansicht weg. Damit „nicht gelöscht" nicht heißt „nicht mehr erreichbar",
 * schreibt dieses Skript den Bestand als JSON heraus, BEVOR der Umzug
 * ausgeliefert wird. Es liest ausschließlich — es verändert nichts.
 *
 *   node --env-file=apps/comments/.env packages/feedback/scripts/backup-feedback.mjs
 *   node --env-file=apps/comments/.env packages/feedback/scripts/backup-feedback.mjs --out /pfad/feedback-2026-07-31.json
 *
 * Zuerst wird GEZÄHLT und die Zahl ausgegeben (der Plan verlangt „Zeilen
 * vorher zählen"), danach vollständig paginiert geholt. Stimmen Zählung und
 * geholte Menge nicht überein, endet der Lauf mit Exit 1 — eine halbe
 * Sicherung ist schlimmer als keine, weil sie wie eine ganze aussieht.
 *
 * Benötigte Key-Scopes: rows.read (Runtime-Key genügt).
 */
import { writeFileSync } from 'node:fs'
import { Client, Query, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Fehlende Env-Vars — mit --env-file=apps/comments/.env aufrufen.')
  process.exit(1)
}

const argv = process.argv.slice(2)
let out = null
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = argv[++i]
  else {
    console.error(`✗ Unbekanntes Argument: ${argv[i]}\n  Nutzung: backup-feedback.mjs [--out <datei.json>]`)
    process.exit(1)
  }
}
if (!out) {
  const stamp = new Date().toISOString().slice(0, 10)
  out = `feedback-backup-${projectId}-${stamp}.json`
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const TABLE = 'feedback'
const PAGE = 100

console.log(`Sicherung von ${TABLE} aus ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

// 1) Zählen — die Zahl steht im Protokoll und ist gleich die Sollgröße.
const head = await tablesDB.listRows({
  databaseId, tableId: TABLE, queries: [Query.limit(1)],
}).catch((error) => {
  console.error('✗ Konnte die Tabelle nicht lesen:', error?.message ?? error)
  process.exit(1)
})
const expected = head.total
console.log(`  Zeilen laut Zählung: ${expected}`)

// 2) Vollständig paginieren (Cursor statt Offset — stabil auch bei Schreibern
//    währenddessen; die App läuft beim Sichern weiter).
const rows = []
let cursor = null
for (;;) {
  const queries = [Query.orderAsc('$id'), Query.limit(PAGE)]
  if (cursor) queries.push(Query.cursorAfter(cursor))
  const res = await tablesDB.listRows({ databaseId, tableId: TABLE, queries })
  rows.push(...res.rows)
  if (res.rows.length < PAGE) break
  cursor = res.rows[res.rows.length - 1].$id
}

if (rows.length !== expected) {
  console.error(`✗ Zählung (${expected}) ≠ gesicherte Zeilen (${rows.length}) — Sicherung NICHT verwendbar.`)
  process.exit(1)
}

writeFileSync(out, JSON.stringify({
  source: { endpoint, projectId, databaseId, tableId: TABLE },
  exportedAt: new Date().toISOString(),
  total: rows.length,
  rows,
}, null, 2), 'utf8')

console.log(`✔ ${rows.length} Zeile(n) gesichert → ${out}`)
