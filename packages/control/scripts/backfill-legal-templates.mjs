/**
 * Nachrüsten der Rechtsseiten-Vorlagen für BESTEHENDE Communities
 * (Audit-Befund S7, Teil 1). Neue Communities bekommen Impressum +
 * Datenschutz beim Anlegen (packages/pages/server/utils/seedLegalPages.ts);
 * dieses Skript holt die nach, die es vorher schon gab.
 *
 * Eigenschaften, die hier der Kern sind:
 *
 *  - **Trocken als Voreinstellung.** Ohne `--write` wird NICHTS geschrieben,
 *    nur berichtet. Ein Nachrüst-Lauf gegen Produktion darf kein Versehen sein.
 *  - **Idempotent.** Vorhandene slug+locale-Rows bleiben unberührt (kein
 *    Überschreiben von Kundentexten), ein Zweitlauf legt nichts an.
 *  - **Entwurf, nie veröffentlicht.** Gleiche Regel wie beim Onboarding: leere
 *    Rechtstexte gehen nicht live.
 *  - **Nur Pool-Mandanten.** Silo-Instanzen haben ihr EIGENES Appwrite-Projekt;
 *    für sie hat dieses Skript keinen Schlüssel und meldet sie nur.
 *
 * Sprache je Community: aus der vorhandenen Startseite abgeleitet (die hat der
 * Wizard in der Wunschsprache angelegt), sonst `--locale`, sonst 'de'.
 *
 * Aufruf (Node 22, Vorlagen kommen aus einem .ts-Modul):
 *
 *   POOL_KEY=… node --experimental-strip-types \
 *     --env-file=apps/control/.env \
 *     packages/control/scripts/backfill-legal-templates.mjs [--write] [--locale de]
 *
 * Env: NUXT_PUBLIC_APPWRITE_* + Key = CONTROL PLANE (tenants-Register),
 *      POOL_KEY (+ optional NUXT_PUBLIC_CONTROL_POOL_PROJECT, POOL_DATABASE_ID)
 *      = Runtime-Projekt, in dem die pages-Rows liegen.
 */
import { Client, ID, Query, TablesDB } from 'node-appwrite'
// Cross-Layer als EXPLIZITER Vertrag (A14): der pages-Layer besitzt die Tabelle
// UND die Vorlagen. Eine zweite Kopie hier würde garantiert auseinanderlaufen.
// Explizite .ts-Endung: das Skript läuft direkt unter Node --experimental-strip-types.
import { legalTemplateLocale, legalTemplates } from '../../pages/shared/legalTemplates.ts'

const write = process.argv.includes('--write')
const localeArg = process.argv.includes('--locale')
  ? process.argv[process.argv.indexOf('--locale') + 1]
  : null

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const controlDatabaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY
const poolDatabaseId = process.env.POOL_DATABASE_ID || 'main'

if (!endpoint || !controlProject || !controlDatabaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig — mit --env-file=apps/<control-app>/.env aufrufen und POOL_KEY setzen.')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const pool = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

console.log(`\nRechtsseiten-Vorlagen nachrüsten${write ? '' : ' — TROCKENLAUF (nichts wird geschrieben, --write schreibt)'}`)
console.log(`  Control Plane: ${controlProject}/${controlDatabaseId} · Pool: ${poolProject}/${poolDatabaseId}\n`)

/** Alle Mandanten des Registers (paginiert — kein stilles Kappen). */
async function allTenants() {
  const rows = []
  for (let offset = 0; ; offset += 100) {
    const page = await control.listRows({
      databaseId: controlDatabaseId,
      tableId: 'tenants',
      queries: [Query.limit(100), Query.offset(offset)],
    })
    rows.push(...page.rows)
    if (page.rows.length < 100) break
  }
  return rows
}

/** pages-Rows eines Mandanten (Vorlagen-Slugs reichen für die Entscheidung). */
async function pagesOf(tenantId) {
  const { rows } = await pool.listRows({
    databaseId: poolDatabaseId,
    tableId: 'pages',
    queries: [Query.equal('tenantId', tenantId), Query.limit(100)],
  })
  return rows
}

const tenants = await allTenants()
let created = 0
let skipped = 0
let silos = 0

for (const tenant of tenants) {
  if (tenant.mode !== 'pool') {
    silos++
    console.log(`↷ ${tenant.host} — Silo-Instanz (eigenes Projekt ${tenant.projectId}), hier nicht zuständig`)
    continue
  }
  if (!tenant.tenantId) {
    console.log(`✗ ${tenant.host} — ohne tenantId: übersprungen (eine Seite ohne Scope wäre die Seite von allen)`)
    continue
  }

  const existing = await pagesOf(tenant.tenantId)
  // Sprache: die Startseite ist der beste Zeuge der Wunschsprache.
  const home = existing.find(row => row.slug === 'home')
  const locale = localeArg || home?.locale || 'de'
  const templates = legalTemplates(locale)

  for (const template of templates) {
    const already = existing.find(row => row.slug === template.slug && row.locale === locale)
    if (already) {
      skipped++
      console.log(`↷ ${tenant.host} · ${template.slug}/${locale} existiert (${already.status}) — unberührt`)
      continue
    }
    if (!write) {
      created++
      console.log(`· ${tenant.host} · ${template.slug}/${locale} WÜRDE als Entwurf entstehen (Vorlage ${legalTemplateLocale(locale)})`)
      continue
    }
    try {
      await pool.createRow({
        databaseId: poolDatabaseId,
        tableId: 'pages',
        rowId: ID.unique(),
        data: {
          slug: template.slug,
          locale,
          tenantId: tenant.tenantId,
          title: template.title,
          body: template.body,
          status: 'draft',
          sortOrder: template.sortOrder,
        },
      })
      created++
      console.log(`✔ ${tenant.host} · ${template.slug}/${locale} als Entwurf angelegt`)
    }
    catch (error) {
      // 409 = Unique-Index uq_slug_locale_tenant (pages-004) hat einen
      // Wettlauf abgefangen: die Seite existiert, also nichts zu tun.
      if (error?.code === 409) {
        skipped++
        console.log(`↷ ${tenant.host} · ${template.slug}/${locale} existiert bereits (409)`)
        continue
      }
      console.error(`✗ ${tenant.host} · ${template.slug}/${locale}: ${error?.message || error}`)
      process.exitCode = 1
    }
  }
}

console.log(`\n${write ? 'Angelegt' : 'Anzulegen'}: ${created} · übersprungen: ${skipped} · Silo-Instanzen gemeldet: ${silos}`)
if (!write && created > 0) console.log('Zum Schreiben denselben Aufruf mit --write wiederholen.')
if (write && created > 0) console.log('Alle neuen Seiten sind ENTWÜRFE — die Betreiber füllen und veröffentlichen sie selbst.')
