#!/usr/bin/env node
/**
 * C18 — EINZELVORGANG: einer BESTANDS-Community ihr Lese-Publikum explizit
 * eintragen. Kein Backfill, kein Sweep, keine Automatik — ein Host, ein Lauf,
 * eine Zeile.
 *
 * ═══ WARUM ES DIESES SKRIPT ÜBERHAUPT GIBT ═══════════════════════════════
 *
 * `resolveTenantAudience()` liest die Spalte FAIL-CLOSED: `null` (jede Row von
 * vor control-016, denn Appwrite backfillt Spalten-Defaults nicht) bedeutet
 * 'members'. Das ist für eine Datenschutzgrenze richtig und bleibt so.
 *
 * ABER: bis C18 hat NICHTS diese Spalte ausgewertet. Die Zeilen der
 * Bestands-Communities tragen `read("any")`, ihre Seiten sind öffentlich, ihre
 * Sitemap ist im Index — sie sind DE FACTO öffentlich, und nur ihr Eintrag sagt
 * etwas anderes. Mit dem C18-Deploy fängt der Eintrag an zu wirken:
 *
 *   - robots.txt antwortet `Disallow: /`
 *   - sitemap.xml antwortet 404
 *   - /og/<key>.png antwortet 404 (Vorschaubilder in Chats verschwinden)
 *   - jede Seite trägt `noindex, nofollow`
 *   - /api/pages/public/* antwortet Gästen 404 (die Startseite!)
 *
 * Die ROWS (Kommentare, Beiträge, Events, Medien) bleiben dabei lesbar — ihre
 * Permissions ändert niemand ungefragt. Das Ergebnis wäre also kein Leck,
 * sondern etwas fast Schlimmeres: eine Community, die halb zu ist, ohne dass
 * jemand es entschieden hat.
 *
 * Deshalb: JEDE Bestands-Community, die öffentlich bleiben soll, bekommt einmal
 * diesen Stempel. Die Demo-Community (`demo.pukalani.app`) ist der klare Fall —
 * sie existiert, um gesehen zu werden.
 *
 * ═══ WAS ES TUT (und was nicht) ═════════════════════════════════════════
 *
 * Es schreibt GENAU EIN Feld (`audience`) in GENAU EINER `communities`-Row, die
 * über ihren HOST gefunden wird. Es fasst KEINE Row-Permissions an — das ist
 * bewusst: der Stempel 'public' beschreibt nur, was ohnehin gilt. Wer eine
 * Community wirklich UMSCHALTEN will, nimmt den Schalter unter
 * /dashboard/community; der zieht den Bestand mit um
 * (audienceRepermission.ts).
 *
 * ═══ AUFRUF ════════════════════════════════════════════════════════════
 *
 * Aus packages/control, gegen die CONTROL-PLANE-Instanz (dort liegt
 * `communities`) — Prod also mit der Prod-.env des control-Deployments:
 *
 *   node --env-file=../../apps/control/.env scripts/stamp-audience.mjs \
 *        --host demo.pukalani.app --audience public
 *
 * Ohne `--yes` läuft es als TROCKENLAUF: es zeigt, was es täte, und schreibt
 * nichts. Erst `--yes` schreibt.
 *
 *   node --env-file=../../apps/control/.env scripts/stamp-audience.mjs \
 *        --host demo.pukalani.app --audience public --yes
 *
 * Idempotent: steht der Wert schon so, passiert nichts.
 */
import { Client, Query, TablesDB } from 'node-appwrite'

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? '' : (process.argv[i + 1] ?? '')
}

const host = arg('host').trim().toLowerCase()
const audience = arg('audience').trim()
const confirmed = process.argv.includes('--yes')

if (!host || !['members', 'public'].includes(audience)) {
  console.error('Aufruf: --host <hostname> --audience <members|public> [--yes]')
  process.exit(1)
}

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<control-.env> aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const { rows } = await tablesDB.listRows({
  databaseId, tableId: 'communities',
  queries: [Query.equal('host', host), Query.limit(2)],
})

if (rows.length !== 1) {
  console.error(`✗ ${rows.length} Communities mit host=${host} gefunden — erwartet genau 1. Nichts geändert.`)
  process.exit(1)
}

const row = rows[0]
console.log(`Instanz : ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)
console.log(`Community: ${row.name || '(ohne Namen)'} · ${row.host} · ${row.$id}`)
console.log(`audience : ${row.audience === null || row.audience === undefined ? '(nicht gesetzt → gilt als members)' : row.audience}  →  ${audience}`)

if (row.audience === audience) {
  console.log('\n✔ Steht bereits so — nichts zu tun.')
  process.exit(0)
}

if (!confirmed) {
  console.log('\n↷ TROCKENLAUF — nichts geschrieben. Mit --yes ausführen.')
  process.exit(0)
}

await tablesDB.updateRow({
  databaseId, tableId: 'communities', rowId: row.$id, data: { audience },
})
console.log(`\n✔ Geschrieben. Wirksam, sobald der Resolver-Cache der Platform-App abgelaufen ist (≤30 s).`)
