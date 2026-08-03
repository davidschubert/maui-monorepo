#!/usr/bin/env node
/**
 * Seed: 3 Demo-Rechtsseiten (imprint/terms/privacy) je EN + DE, idempotent
 * (upsert nach communityId+slug+locale). Inhalt ist ABSICHTLICH ein deutlich
 * markierter PLATZHALTER — die echten Rechtstexte trägt David/Anwalt im
 * Dashboard ein.
 *
 * MANDANT IST PFLICHT-ENTSCHEIDUNG (Paritäts-Audit 2026-08-02). Vorher lief
 * dieses Skript pool-blind: die Existenzprüfung fragte nur slug+locale, und
 * geschrieben wurde ohne Stempel. Auf einer Pool-Instanz hieß das beides
 * falsch — die fremde Zeile einer anderen Community meldete „existiert schon"
 * (nachgestellt: `home`/`en` gehört dort `t-demo`), und was doch angelegt
 * wurde, war eine Waise mit `communityId: ''`, sichtbar für niemanden.
 *
 * Deshalb verlangt der Aufruf jetzt eine Angabe, welche `--community` gemeint
 * ist. `--single-tenant` ist die ausdrückliche Wahl von `communityId: ''` —
 * genau das, was `scopeRowFor` auf einer Silo-Instanz stempelt (core/server/
 * utils/tenant.ts). Ein Default gibt es bewusst nicht: der falsche von beiden
 * ist auf einer Pool-Instanz nicht zu sehen, sondern nur zu merken.
 *
 * Voraussetzung: Migration pages-001 gelaufen. Aufruf über den Runner:
 *   pnpm migrate --app platform --layer pages   # legt die Tabelle an
 *   node --env-file=apps/control/.env.production \
 *     packages/pages/scripts/seed-demo.mjs --single-tenant
 *   node --env-file=apps/platform/.env \
 *     packages/pages/scripts/seed-demo.mjs --community t-demo
 */
import { Client, ID, Query, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('Fehlende Env-Vars — mit --env-file der App aufrufen.')
  process.exit(1)
}

const args = process.argv.slice(2)
const singleTenant = args.includes('--single-tenant')
const communityArg = args.indexOf('--community')
const community = communityArg >= 0 ? (args[communityArg + 1] ?? '') : null

if (singleTenant === (community !== null)) {
  console.error('Genau eine Angabe nötig: --community <id> (Pool) ODER --single-tenant (Silo).')
  process.exit(1)
}
if (community !== null && !community.trim()) {
  console.error('--community braucht eine Id — für die leere Zuordnung ist --single-tenant gemeint.')
  process.exit(1)
}
const communityId = singleTenant ? '' : community.trim()

console.log(communityId
  ? `Ziel: Community ${communityId}`
  : 'Ziel: Einzel-Mandant (communityId leer)')

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const PLACEHOLDER_EN = (name) => `## ${name}

**Placeholder — replace this with your real, legally reviewed text in the dashboard (Pages).**

This page is publicly reachable. Do not go live with this placeholder content.

### Section 1

Lorem ipsum. Add your content here.

### Section 2

Lorem ipsum. Add your content here.`

const PLACEHOLDER_DE = (name) => `## ${name}

**Platzhalter — bitte im Dashboard (Seiten) durch euren echten, anwaltlich geprüften Text ersetzen.**

Diese Seite ist öffentlich erreichbar. Nicht mit diesem Platzhalter live gehen.

### Abschnitt 1

Lorem ipsum. Inhalt hier ergänzen.

### Abschnitt 2

Lorem ipsum. Inhalt hier ergänzen.`

const PAGES = [
  { slug: 'imprint', sortOrder: 0, en: { title: 'Imprint' }, de: { title: 'Impressum' } },
  { slug: 'terms', sortOrder: 1, en: { title: 'Terms & Conditions' }, de: { title: 'AGB' } },
  { slug: 'privacy', sortOrder: 2, en: { title: 'Privacy Policy' }, de: { title: 'Datenschutzerklärung' } },
]

async function upsert(slug, locale, title, body, sortOrder) {
  // communityId GEHÖRT in die Abfrage: der Unique-Index heißt
  // uq_slug_locale_tenant (pages-004) — eindeutig ist ein Slug nur INNERHALB
  // eines Mandanten, die Existenzfrage also auch.
  const existing = await tablesDB.listRows({
    databaseId, tableId: 'pages',
    queries: [
      Query.equal('communityId', communityId),
      Query.equal('slug', slug),
      Query.equal('locale', locale),
      Query.limit(1),
    ],
  })
  const data = { communityId, slug, locale, title, body, status: 'published', sortOrder }
  if (existing.rows[0]) {
    console.log(`↷ ${slug}/${locale} existiert — übersprungen (kein Überschreiben deiner Inhalte)`)
    return
  }
  await tablesDB.createRow({ databaseId, tableId: 'pages', rowId: ID.unique(), data })
  console.log(`✔ ${slug}/${locale} angelegt (${title})`)
}

for (const p of PAGES) {
  await upsert(p.slug, 'en', p.en.title, PLACEHOLDER_EN(p.en.title), p.sortOrder)
  await upsert(p.slug, 'de', p.de.title, PLACEHOLDER_DE(p.de.title), p.sortOrder)
}
console.log('Seed fertig — Inhalte im Dashboard (Seiten) mit echten Rechtstexten ersetzen.')
