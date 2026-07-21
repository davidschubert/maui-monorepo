#!/usr/bin/env node
/**
 * Seed: 3 Demo-Rechtsseiten (imprint/terms/privacy) je EN + DE, idempotent
 * (upsert nach slug+locale). Inhalt ist ABSICHTLICH ein deutlich markierter
 * PLATZHALTER — die echten Rechtstexte trägt David/Anwalt im Dashboard ein.
 *
 * Voraussetzung: Migration pages-001 gelaufen. Aufruf über den Runner:
 *   pnpm migrate --app studio --layer pages   # legt die Tabelle an
 *   node --env-file=apps/studio/.env.production packages/pages/scripts/seed-demo.mjs
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
  const existing = await tablesDB.listRows({
    databaseId, tableId: 'pages',
    queries: [Query.equal('slug', slug), Query.equal('locale', locale), Query.limit(1)],
  })
  const data = { slug, locale, title, body, status: 'published', sortOrder }
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
