#!/usr/bin/env node
/**
 * Demo-Content „Morgenlicht" (Tagesliste 2026-07-26, Davids Freigabe „alle
 * Features, auch Pro"): befüllt den Demo-Tenant `t-demo` im Pool mit einer
 * glaubwürdigen Community — deutschsprachige Yoga-Coachin auf Maui, Mitglieder
 * mit echten Anliegen. Zeigt: CMS-Seiten (de+en), Homepage mit [[comments]],
 * Feed (Text + Poll + geplanter Post), Kommentar-Threads mit Votes, zweiphasig
 * versteckten Spam + offene Meldungen (Moderations-Queue im Dashboard).
 *
 * DETERMINISTISCH: räumt zuerst ALLE t-demo-Rows der befüllten Tabellen ab
 * (der Demo-Tenant gehört vollständig diesem Script), seedet dann neu —
 * beliebig oft wiederholbar. `--clean` räumt nur ab, ohne Neubefüllung.
 *
 * Aufruf (aus apps/platform, node-appwrite löst dort auf):
 *   node --env-file=<pool.env> scripts/seed-demo-morgenlicht.mjs [--clean]
 *
 * Row-Permissions folgen den App-Routen: Posts published = read(any)
 * (postsFeed.POST_READ_ANY), sichtbare Kommentare read(any), versteckte nur
 * admin/moderator-Labels, pages-Rows OHNE Permissions (server-only-Render),
 * Votes ohne Publikum. tenantId wird wie die Datentür gestempelt.
 */
import { Client, ID, Permission, Query, Role, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<pool-.env> aufrufen.')
  process.exit(1)
}

const TENANT = 't-demo'
const CLEAN_ONLY = process.argv.includes('--clean')
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const READ_ANY = Permission.read(Role.any())
const READ_MODERATION = [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))]

const TABLES = ['pages', 'community_posts', 'post_votes', 'poll_votes', 'comments', 'comment_votes', 'reports']

/** Alle t-demo-Rows einer Tabelle löschen (paginiert, bis leer). */
async function wipe(table) {
  let removed = 0
  for (;;) {
    const { rows } = await tablesDB.listRows({
      databaseId, tableId: table,
      queries: [Query.equal('tenantId', TENANT), Query.limit(100)],
    })
    if (!rows.length) break
    for (const row of rows) {
      await tablesDB.deleteRow({ databaseId, tableId: table, rowId: row.$id })
      removed++
    }
  }
  console.log(`  ${table}: ${removed} alte Rows entfernt`)
}

async function create(table, data, permissions = []) {
  return await tablesDB.createRow({
    databaseId, tableId: table, rowId: ID.unique(),
    data: { ...data, tenantId: TENANT },
    permissions,
  })
}

/** ISO-Zeitpunkt vor `days` Tagen (+ optionale Stunden-Verschiebung). */
function daysAgo(days, hours = 0) {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString()
}
function daysAhead(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

// ── Personas (synthetische IDs — bewusst KEINE echten Accounts) ─────────────
const LENA = { authorId: 'demo-lena', authorName: 'Lena (Coach)' }
const ANNA = { authorId: 'demo-anna', authorName: 'Anna' }
const JONAS = { authorId: 'demo-jonas', authorName: 'Jonas' }
const MIRIAM = { authorId: 'demo-miriam', authorName: 'Miriam' }
const TOBI = { authorId: 'demo-tobi', authorName: 'Tobi' }

console.log(`Morgenlicht-Seed gegen ${endpoint} / Projekt ${projectId} / Tenant ${TENANT}\n`)
console.log('Aufräumen …')
for (const table of TABLES) await wipe(table)
if (CLEAN_ONLY) {
  console.log('\n✔ --clean: nur abgeräumt.')
  process.exit(0)
}

// ── 1. CMS-Seiten (de+en; Rows OHNE Permissions — public Route filtert) ─────
console.log('\nSeiten …')
const PAGES = [
  {
    slug: 'home', sortOrder: 0,
    de: {
      title: 'Willkommen bei Morgenlicht 🌅',
      body: [
        'Schön, dass du hier bist! **Morgenlicht** ist unsere Community für alle, die den Tag bewusst beginnen wollen — mit Yoga, Atem und einem Moment Ruhe, bevor die Welt laut wird.',
        '',
        'Ich bin Lena, ich lebe auf Maui und starte jeden Morgen mit der Sonne über dem Haleakalā. Von hier aus begleite ich euch — egal in welcher Zeitzone euer Morgen stattfindet.',
        '',
        '**So findest du dich zurecht:**',
        '',
        '- Im [Feed](/feed) findest du Ankündigungen, Fragen und unsere Umfragen.',
        '- Die [Hausregeln](/hausregeln) sind kurz — versprochen.',
        '- Wer schreibt hier überhaupt? [Über mich](/ueber-mich).',
        '',
        'Sag unten kurz hallo — ich lese alles. 💛',
        '',
        '[[comments]]',
      ].join('\n'),
    },
    en: {
      title: 'Welcome to Morgenlicht 🌅',
      body: [
        'So glad you are here! **Morgenlicht** (German for “morning light”) is our community for everyone who wants to start the day deliberately — with yoga, breath, and a quiet moment before the world gets loud.',
        '',
        'I am Lena, I live on Maui and greet every sunrise above Haleakalā. From here I coach you — whatever time zone your morning happens in.',
        '',
        '**Finding your way around:**',
        '',
        '- The [feed](/feed) has announcements, questions, and our polls.',
        '- The [house rules](/hausregeln) are short — promise.',
        '- Who is writing all this? [About me](/ueber-mich).',
        '',
        'Say hi below — I read everything. 💛',
        '',
        '[[comments]]',
      ].join('\n'),
    },
  },
  {
    slug: 'hausregeln', sortOrder: 1,
    de: {
      title: 'Hausregeln',
      body: [
        'Drei Regeln reichen uns:',
        '',
        '1. **Freundlich zuerst.** Wir üben alle — auf der Matte und im Ton.',
        '2. **Kein Spam, keine Werbung.** Beiträge mit Verkaufsabsicht werden ausgeblendet.',
        '3. **Körper ist privat.** Teile nur, was du teilen willst; medizinische Fragen gehören zu Ärztin oder Arzt.',
        '',
        'Wer etwas sieht, das hier nicht hingehört: **Melden-Knopf** nutzen — das Team schaut sich jede Meldung an.',
      ].join('\n'),
    },
    en: {
      title: 'House rules',
      body: [
        'Three rules are all we need:',
        '',
        '1. **Kind first.** We are all practicing — on the mat and in tone.',
        '2. **No spam, no ads.** Posts with sales intent get hidden.',
        '3. **Bodies are private.** Share only what you want to share; medical questions belong with a doctor.',
        '',
        'If you see something that does not belong here: use the **report button** — the team reviews every report.',
      ].join('\n'),
    },
  },
  {
    slug: 'ueber-mich', sortOrder: 2,
    de: {
      title: 'Über mich',
      body: [
        'Aloha! Ich bin **Lena**, Yogalehrerin (500h RYT) und seit vier Jahren auf Maui zu Hause — in Pukalani, am Hang des Haleakalā.',
        '',
        'Was als Sonnenaufgangs-Ritual mit zwei Freundinnen begann, ist heute diese Community: kurze Morgen-Flows, ehrliche Check-ins und einmal im Jahr ein Retreat am Strand.',
        '',
        '**Meine Haltung:** Beweglichkeit ist keine Leistung. Fünf Minuten am Morgen zählen mehr als die perfekte Pose.',
        '',
        '_Du erreichst mich am schnellsten über einen Beitrag im Feed._',
      ].join('\n'),
    },
    en: {
      title: 'About me',
      body: [
        'Aloha! I am **Lena**, a yoga teacher (500h RYT), at home on Maui for four years now — in Pukalani, on the slopes of Haleakalā.',
        '',
        'What started as a sunrise ritual with two friends is this community today: short morning flows, honest check-ins, and one beach retreat a year.',
        '',
        '**My take:** mobility is not a performance. Five minutes in the morning beat the perfect pose.',
        '',
        '_The fastest way to reach me is a post in the feed._',
      ].join('\n'),
    },
  },
]
for (const page of PAGES) {
  for (const locale of ['de', 'en']) {
    await create('pages', {
      slug: page.slug, locale, title: page[locale].title, body: page[locale].body,
      status: 'published', sortOrder: page.sortOrder,
    })
  }
  console.log(`  ${page.slug} (de+en)`)
}

// ── 2. Feed-Posts ───────────────────────────────────────────────────────────
console.log('\nPosts …')

await create('community_posts', {
  type: 'text',
  title: 'Willkommen im Feed — so nutzen wir ihn',
  body: 'Hier landen Ankündigungen, Fragen und alles zwischen Matte und Morgenkaffee. Stellt Fragen ruhig direkt als Beitrag — davon leben wir. Und wer mag: unten ist immer Platz für Kommentare. 🌅',
  ...LENA, status: 'published', scheduledAt: null, publishedAt: daysAgo(6),
  pollOptions: null, pollEndsAt: null, upvotes: 9, downvotes: 0, score: 9,
}, [READ_ANY])

const postRoutine = await create('community_posts', {
  type: 'text',
  title: 'Eure Morgen-Reihenfolge: erst Matte oder erst Kaffee?',
  body: 'Ehrliche Frage für ein Video, das ich gerade plane: Was kommt bei euch ZUERST? Ich bin Team „Matte vor Kaffee" — aber nur, weil die Sonne hier so früh aufgeht. 😄',
  ...LENA, status: 'published', scheduledAt: null, publishedAt: daysAgo(4),
  pollOptions: null, pollEndsAt: null, upvotes: 14, downvotes: 1, score: 13,
}, [READ_ANY])

const postPoll = await create('community_posts', {
  type: 'poll',
  title: 'Wann passt euch die nächste Live-Session am besten?',
  body: 'Ich richte mich nach eurer Mehrheit — Zeiten sind jeweils deutsche Zeit (hier auf Maui ist es dann noch der Vorabend 🌙).',
  ...LENA, status: 'published', scheduledAt: null, publishedAt: daysAgo(2),
  pollOptions: JSON.stringify(['6:00 Uhr', '6:30 Uhr', '7:00 Uhr', 'Lieber am Wochenende']),
  pollEndsAt: daysAhead(3), upvotes: 6, downvotes: 0, score: 6,
}, [READ_ANY])

const postWrists = await create('community_posts', {
  type: 'text',
  title: 'Handgelenke schmerzen im herabschauenden Hund — Tipps?',
  body: 'Seit zwei Wochen zwickt es im rechten Handgelenk, sobald ich länger im Hund bleibe. Aufwärmen mache ich schon. Hat jemand eine Anpassung, die bei euch geholfen hat?',
  ...MIRIAM, status: 'published', scheduledAt: null, publishedAt: daysAgo(1, 4),
  pollOptions: null, pollEndsAt: null, upvotes: 7, downvotes: 0, score: 7,
}, [READ_ANY])

const postRetreat = await create('community_posts', {
  type: 'text',
  title: 'Rückblick: unser Retreat-Wochenende 🏝️',
  body: 'Drei Tage, zwölf Menschen, ein Strand und genau null Wecker — nur das Licht. Danke an alle, die dabei waren. Fotos folgen im Album, sobald alle ihr Okay gegeben haben (Hausregel 3!). Nächster Termin kommt als Umfrage.',
  ...LENA, status: 'published', scheduledAt: null, publishedAt: daysAgo(0, 7),
  pollOptions: null, pollEndsAt: null, upvotes: 11, downvotes: 0, score: 11,
}, [READ_ANY])

// Geplanter Post: im öffentlichen Feed unsichtbar (read nur Autor), erscheint
// im Dashboard unter „Geplant" — und published sich nach Ablauf selbst
// (publishDuePosts beim ersten Feed-GET danach).
await create('community_posts', {
  type: 'text',
  title: 'Ankündigung: Kurs „Mobility am Morgen" startet nächste Woche',
  body: 'Vier Wochen, jeden zweiten Tag zehn Minuten — Handgelenke, Schultern, Hüfte. Anmeldung öffnet mit diesem Beitrag automatisch. (Dieser Post wurde im Voraus geplant.)',
  ...LENA, status: 'scheduled', scheduledAt: daysAhead(7), publishedAt: null,
  pollOptions: null, pollEndsAt: null, upvotes: 0, downvotes: 0, score: 0,
}, [Permission.read(Role.user(LENA.authorId))])
console.log('  5 veröffentlicht + 1 geplant')

// Poll-Stimmen (Zählung läuft über poll_votes-Rows, nicht über Zähler)
const pollSpread = [[ANNA, 0], [JONAS, 1], [MIRIAM, 1], [TOBI, 3], [{ authorId: 'demo-kim', authorName: 'Kim' }, 1], [{ authorId: 'demo-lea', authorName: 'Lea' }, 3]]
for (const [who, optionIndex] of pollSpread) {
  await create('poll_votes', { postId: postPoll.$id, userId: who.authorId, optionIndex })
}
// Ein paar Post-Votes als echte Rows (Zähler oben sind autoritativ gesetzt)
for (const [who, postId, value] of [[ANNA, postRoutine.$id, 1], [JONAS, postRoutine.$id, 1], [TOBI, postWrists.$id, 1], [MIRIAM, postRetreat.$id, 1]]) {
  await create('post_votes', { postId, userId: who.authorId, value })
}
console.log(`  ${pollSpread.length} Poll-Stimmen, 4 Post-Votes`)

// ── 3. Kommentare (Homepage + Threads am Post) ──────────────────────────────
console.log('\nKommentare …')
async function comment({ target, targetUrl, author, content, parent = null, up = 0, down = 0, status = 'active', ageDays = 0, ageHours = 0 }) {
  void ageDays; void ageHours // $createdAt ist system-verwaltet — Alter nur der Lesbarkeit halber im Aufruf
  const perms = status === 'hidden'
    ? [...READ_MODERATION]
    : [READ_ANY, Permission.update(Role.user(author.authorId)), Permission.delete(Role.user(author.authorId))]
  return await create('comments', {
    targetId: target.id, targetType: target.type, content,
    authorId: author.authorId, authorName: author.authorName, authorKind: 'user',
    parentId: parent?.$id ?? null, rootId: parent ? (parent.rootId ?? parent.$id) : null,
    depth: parent ? (parent.depth ?? 0) + 1 : 0,
    targetUrl, editedAt: null, upvotes: up, downvotes: down, score: up - down, status,
  }, perms)
}

const HOME = { id: 'home', type: 'page' }
await comment({ target: HOME, targetUrl: '/', author: ANNA, content: 'Hallo aus Freiburg! Seit dem Retreat letztes Jahr bin ich süchtig nach den Morgen-Flows. 🙋‍♀️', up: 5 })
await comment({ target: HOME, targetUrl: '/', author: JONAS, content: 'Hi! Kompletter Anfänger hier — die 5-Minuten-Einsteiger-Reihe ist genau mein Tempo.', up: 3 })
const homeLena = await comment({ target: HOME, targetUrl: '/', author: LENA, content: 'Willkommen euch beiden! Schreibt gern in den Feed, wenn ihr Fragen habt — hier liest die ganze Community mit. 💛', up: 4 })
await comment({ target: HOME, targetUrl: '/', author: TOBI, content: 'Aloha! Bin über die Demo hier gelandet und geblieben. 😄', parent: homeLena, up: 2 })

const WRISTS = { id: postWrists.$id, type: 'post' }
const tip1 = await comment({ target: WRISTS, targetUrl: '/feed', author: TOBI, content: 'Was mir geholfen hat: Fäuste statt flacher Hände (auf einer weichen Matte) — nimmt sofort Druck aus dem Gelenk.', up: 6 })
await comment({ target: WRISTS, targetUrl: '/feed', author: MIRIAM, content: 'Danke dir! Fäuste probiere ich morgen früh direkt aus. 🙏', parent: tip1, up: 2 })
const tip2 = await comment({ target: WRISTS, targetUrl: '/feed', author: LENA, content: 'Guter Tipp von Tobi! Zusätzlich: Delfin statt Hund als Alternative (Unterarme am Boden), und vorher die Handgelenke kreisen — 30 Sekunden reichen. Wenn es länger als zwei Wochen zwickt, bitte ärztlich abklären (Hausregel 3 💛).', up: 8 })
await comment({ target: WRISTS, targetUrl: '/feed', author: ANNA, content: 'Delfin hat bei mir damals den Unterschied gemacht — seither null Probleme.', parent: tip2, up: 3 })

const ROUTINE = { id: postRoutine.$id, type: 'post' }
await comment({ target: ROUTINE, targetUrl: '/feed', author: JONAS, content: 'Kaffee. Immer Kaffee. Ich bin ehrlich. ☕', up: 4 })
await comment({ target: ROUTINE, targetUrl: '/feed', author: MIRIAM, content: 'Matte zuerst — sonst gewinnt das Sofa.', up: 5 })

// Zweiphasiges Hide + Meldungen: der Spam ist öffentlich UNSICHTBAR (read nur
// Moderations-Labels), die drei OFFENEN reports dazu füllen die Queue im
// Dashboard — autoHideReports=3 der App ist damit live vorgeführt.
const spam = await comment({ target: ROUTINE, targetUrl: '/feed', author: { authorId: 'demo-spam', authorName: 'FlexPro Shop' }, content: 'MEGA DEAL nur heute: Yoga-Matten im 3er-Pack, Link in meinem Profil!!', status: 'hidden' })
for (const reporter of [ANNA, MIRIAM, JONAS]) {
  await create('reports', {
    reporterId: reporter.authorId, targetType: 'comment', targetId: spam.$id,
    reason: 'spam', note: 'Werbung, Verstoß gegen Hausregel 2', status: 'open',
    resolvedBy: null, resolution: null,
  }, READ_MODERATION)
}
console.log('  11 sichtbar (2 Ebenen), 1 versteckt (Spam), 3 offene Meldungen')

// Kommentar-Votes als echte Rows für die Top-Kommentare
for (const [who, row] of [[ANNA, tip1], [JONAS, tip2], [TOBI, tip2], [MIRIAM, homeLena]]) {
  await create('comment_votes', { commentId: row.$id, userId: who.authorId, value: 1 })
}

console.log('\n✔ Morgenlicht steht. Kontrolle: https://demo.pukalani.app (Startseite mit Kommentaren), /feed (Posts + Poll), /hausregeln, /ueber-mich — Spam-Kommentar nur im Dashboard sichtbar.')
