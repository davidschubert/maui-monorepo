#!/usr/bin/env node
/**
 * Demo-Content „Morgenlicht" (Tagesliste 2026-07-26, Davids Freigabe „alle
 * Features, auch Pro"): befüllt den Demo-Tenant `t-demo` im Pool mit einer
 * glaubwürdigen Community — Yoga-Coachin Lena auf Maui, Mitglieder mit echten
 * Anliegen. Zeigt: CMS-Seiten (de+en), Homepage mit [[comments]], Feed (Post +
 * Frage + Poll + geplanter Post), Kommentar-Threads mit Votes, zweiphasig
 * versteckten Spam + offene Meldungen (Moderations-Queue im Dashboard).
 *
 * ZWEISPRACHIG (Audit-Befund S4, Davids Entscheidung DECISION-LOG 2026-07-27
 * Punkt 6): EN-Besucher sollen englische Beispiele sehen. Die beiden
 * Datenmodelle können das unterschiedlich — das Seed-Design folgt ihnen:
 *
 *  - CMS-SEITEN können es RICHTIG: die pages-Table hat eine Row je
 *    slug×locale (Unique-Index uq_slug_locale_tenant, pages-001/004) und die
 *    öffentliche Route liest `?locale=` mit Fallback en → rows[0]. Jede Seite
 *    wird deshalb ZWEIMAL geseedet (de+en), die i18n-Route entscheidet: `/` liefert die
 *    en-Row, `/de/…` die de-Row. Der SLUG ist bewusst locale-UNABHÄNGIG
 *    (eine Row-Gruppe je Dokument) — die englische Fassung von „Hausregeln"
 *    lebt also unter /hausregeln, nicht unter /house-rules. Interne Links in
 *    den Bodies bleiben deshalb präfixlos (`/feed`): core klassifiziert sie
 *    als 'internal' und hängt den Locale-Präfix beim Rendern an
 *    (classifyContentLink, Regressions-Test pages/tests/cms-link-policy).
 *  - FEED (community_posts/comments) hat KEIN locale-Feld — ein Beitrag ist
 *    genau ein Beitrag, in genau der Sprache, in der er geschrieben wurde.
 *    Statt Duplikaten seeden wir deshalb den realistischen MIX einer
 *    zweisprachigen Community: deutsche Beiträge bleiben, dazu vier englische
 *    (Retreat-Ankündigung, Frage einer englischsprachigen Teilnehmerin,
 *    Mitglieds-Rückblick, Lenas zweisprachige Ansage). Antworten stehen in der
 *    Sprache der Frage; ein paar bewusste Sprachwechsel bleiben drin, weil
 *    echte Communities genau so klingen.
 *
 * DETERMINISTISCH: räumt zuerst ALLE t-demo-Rows der befüllten Tabellen ab
 * (der Demo-Tenant gehört vollständig diesem Script), seedet dann neu —
 * beliebig oft wiederholbar. `--clean` räumt nur ab, ohne Neubefüllung.
 *
 * Aufruf (aus apps/platform, node-appwrite löst dort auf):
 *   node --env-file=<pool.env> scripts/seed-demo-morgenlicht.mjs [--clean]
 *
 * `--tenant=<id>` zielt auf einen anderen Mandanten — NUR für die lokale
 * Verifikation gedacht (falls die lokale Instanz keinen Demo-Mandanten kennt).
 * Der Flag räumt den Ziel-Mandanten genauso rigoros ab wie t-demo: niemals
 * gegen einen Kunden-Mandanten aufrufen.
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
// RUNTIME-Key, nicht Migrations-Key (Reihenfolge korrigiert 2026-07-27): dieses
// Script arbeitet ausschließlich auf ROWS — genau der Runtime-Scope (Konzept
// A2). Der Migrations-Key hat keinen rows-Scope und umgeht Row-Permissions
// deshalb NICHT: lokal gegen t-demo gemessen sieht er nur die read(any)-Rows
// (23 aktive Kommentare, 9 veröffentlichte Posts) und NICHTS von pages (0/6),
// reports (0/3), Votes (0/17), versteckten Kommentaren (0/1) und geplanten
// Posts (0/1). `wipe()` wäre damit blind für genau diese Rows — sie hätten sich
// bei jedem Lauf angehäuft, und der zweite Lauf wäre am Unique-Index
// (slug, locale, tenantId — pages-004) mit 409 gestorben. Der Fallback bleibt
// nur für Umgebungen, die einen einzigen Key kennen.
const apiKey = process.env.NUXT_APPWRITE_KEY ?? process.env.NUXT_APPWRITE_MIGRATIONS_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<pool-.env> aufrufen.')
  process.exit(1)
}

// Ziel-Mandant: t-demo (Prod). `--tenant=<id>` nur für lokale Verifikation.
const tenantFlag = process.argv.find(arg => arg.startsWith('--tenant='))?.slice('--tenant='.length).trim()
const TENANT = tenantFlag || 't-demo'
if (tenantFlag && tenantFlag !== 't-demo') {
  console.warn(`⚠️  --tenant=${tenantFlag}: dieser Mandant wird VOLLSTÄNDIG abgeräumt und mit Demo-Inhalten überschrieben.`)
}
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
// Lena schreibt beides; Anna/Jonas/Miriam/Tobi deutsch (mit Ausflügen ins
// Englische), Grace/Nalani englisch — der Mix ist der Punkt (Befund S4).
const LENA = { authorId: 'demo-lena', authorName: 'Lena (Coach)' }
const ANNA = { authorId: 'demo-anna', authorName: 'Anna' }
const JONAS = { authorId: 'demo-jonas', authorName: 'Jonas' }
const MIRIAM = { authorId: 'demo-miriam', authorName: 'Miriam' }
const TOBI = { authorId: 'demo-tobi', authorName: 'Tobi' }
const GRACE = { authorId: 'demo-grace', authorName: 'Grace' }
const NALANI = { authorId: 'demo-nalani', authorName: 'Nalani' }

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
        'Im Feed stehen Deutsch und Englisch nebeneinander — schreib in der Sprache, in der du denkst. Ich antworte in der, in der du gefragt hast.',
        '',
        'Sag unten kurz hallo — ich lese alles. 💛',
        '',
        '[[comments]]',
      ].join('\n'),
    },
    en: {
      title: 'Welcome to Morgenlicht 🌅',
      body: [
        'So glad you found us. **Morgenlicht** — German for “morning light” — is our community for anyone who wants to start the day on purpose: a little yoga, a few breaths, one quiet moment before the world gets loud.',
        '',
        'I am Lena. I live on Maui, in Pukalani on the slope of Haleakalā, and my day starts with the sun coming over the crater. From here I practice with you, whatever time zone your morning happens in.',
        '',
        '**Finding your way around:**',
        '',
        '- The [feed](/feed) carries announcements, questions and our polls.',
        '- The [house rules](/hausregeln) are short — promise.',
        '- Who is writing all this? [About me](/ueber-mich).',
        '',
        'You will see German and English side by side here. Write in the language you think in; I answer in the one you asked in.',
        '',
        'Say hello below — I read everything. 💛',
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
        '1. **Kind first.** We are all practising — on the mat and in how we talk to each other.',
        '2. **No spam, no ads.** Anything written to sell something gets hidden.',
        '3. **Your body is your business.** Share only what you want to share, and take medical questions to a doctor rather than to the feed.',
        '',
        'See something that does not belong here? Use the **report button** — a human looks at every report.',
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
        'Ich unterrichte auf Deutsch und auf Englisch — frag mich, wie es dir leichter fällt.',
        '',
        '_Du erreichst mich am schnellsten über einen Beitrag im Feed._',
      ].join('\n'),
    },
    en: {
      title: 'About me',
      body: [
        'Aloha! I am **Lena** — yoga teacher (500h RYT), at home on Maui for four years now, in Pukalani on the slope of Haleakalā.',
        '',
        'What began as a sunrise ritual with two friends is this community today: short morning flows, honest check-ins, and one retreat on the beach every year.',
        '',
        '**Where I stand:** flexibility is not an achievement. Five honest minutes in the morning beat the perfect pose.',
        '',
        'I teach in German and in English — ask me in either one.',
        '',
        '_The fastest way to reach me is a post in the feed._',
      ].join('\n'),
    },
  },
]
// Eine Row je slug×locale (uq_slug_locale) — das IST der Mehrsprachigkeits-
// Mechanismus des pages-Layers: `/` liest die en-Row, `/de/…` die de-Row
// (public/[slug].get.ts, Fallback en). Reihenfolge der Locales ist ohne
// Wirkung, der Unique-Index hält die Paare zusammen.
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
// Sprachen stehen NEBENEINANDER (kein locale-Feld auf community_posts, siehe
// Kopf) — deutsche und englische Beiträge wechseln sich chronologisch ab, damit
// beide Sprachen auf der ERSTEN Feed-Seite auftauchen. `type` sind die echten
// Werte aus POST_TYPES ('post' | 'poll' | 'question'), nicht 'text'.
console.log('\nPosts …')

await create('community_posts', {
  type: 'post',
  title: 'Willkommen im Feed — so nutzen wir ihn',
  body: 'Hier landen Ankündigungen, Fragen und alles zwischen Matte und Morgenkaffee. Stellt Fragen ruhig direkt als Beitrag — davon leben wir. Und wer mag: unten ist immer Platz für Kommentare. 🌅',
  ...LENA, status: 'published', scheduledAt: null, publishedAt: daysAgo(6),
  pollOptions: null, pollEndsAt: null, upvotes: 9, downvotes: 0, score: 9,
}, [READ_ANY])

// Lenas zweisprachige Ansage: EIN Beitrag, beide Sprachen — so machen es echte
// gemischte Communities bei Dingen, die alle angehen.
const postBilingual = await create('community_posts', {
  type: 'post',
  title: 'Two languages, one community 🌺',
  body: 'A note for everyone who found us from the mainland or from anywhere else: **English is just as welcome here as German.** Write in the language you think in — I answer in the one you asked in, and the rest of us manage fine.\n\nKurz auf Deutsch: Ihr müsst nicht ins Englische wechseln, wenn euch etwas auf der Seele liegt. Beides steht hier nebeneinander, genau wie im Kurs.',
  ...LENA, status: 'published', scheduledAt: null, publishedAt: daysAgo(5),
  pollOptions: null, pollEndsAt: null, upvotes: 12, downvotes: 0, score: 12,
}, [READ_ANY])

const postRoutine = await create('community_posts', {
  type: 'post',
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

// Mitglieds-Rückblick auf Englisch — der Beweis, dass nicht nur die Coachin
// zweisprachig ist.
const postThirty = await create('community_posts', {
  type: 'post',
  title: '30 mornings in a row — what actually changed',
  body: 'Not my flexibility, honestly. What changed: I stopped reaching for my phone first. Five minutes on the mat, then the day is allowed to start. I sleep better and I am a nicer person to my kids before school. That is the whole report. 🙏',
  ...NALANI, status: 'published', scheduledAt: null, publishedAt: daysAgo(2, 6),
  pollOptions: null, pollEndsAt: null, upvotes: 13, downvotes: 0, score: 13,
}, [READ_ANY])

const postWrists = await create('community_posts', {
  type: 'post',
  title: 'Handgelenke schmerzen im herabschauenden Hund — Tipps?',
  body: 'Seit zwei Wochen zwickt es im rechten Handgelenk, sobald ich länger im Hund bleibe. Aufwärmen mache ich schon. Hat jemand eine Anpassung, die bei euch geholfen hat?',
  ...MIRIAM, status: 'published', scheduledAt: null, publishedAt: daysAgo(1, 4),
  pollOptions: null, pollEndsAt: null, upvotes: 7, downvotes: 0, score: 7,
}, [READ_ANY])

// Frage einer englischsprachigen Teilnehmerin — `question` zeigt zugleich den
// dritten Post-Typ (Titel größer, CTA „Antworten" statt „Kommentieren").
const postHamstrings = await create('community_posts', {
  type: 'question',
  title: 'Forward folds with tight hamstrings — what actually helps?',
  body: 'On a good day I reach my shins, and that is it. Every video tells me to bend my knees, which I do, but I still feel the pull right behind the knee instead of in the middle of the muscle. Is that normal, or am I doing something wrong?',
  ...GRACE, status: 'published', scheduledAt: null, publishedAt: daysAgo(1, 2),
  pollOptions: null, pollEndsAt: null, upvotes: 8, downvotes: 0, score: 8,
}, [READ_ANY])

const postRetreat = await create('community_posts', {
  type: 'post',
  title: 'Rückblick: unser Retreat-Wochenende 🏝️',
  body: 'Drei Tage, zwölf Menschen, ein Strand und genau null Wecker — nur das Licht. Danke an alle, die dabei waren. Fotos folgen im Album, sobald alle ihr Okay gegeben haben (Hausregel 3!). Nächster Termin kommt als Umfrage.',
  ...LENA, status: 'published', scheduledAt: null, publishedAt: daysAgo(0, 7),
  pollOptions: null, pollEndsAt: null, upvotes: 11, downvotes: 0, score: 11,
}, [READ_ANY])

// Wichtige Ankündigungen sagt Lena in beiden Sprachen — hier die englische
// Fassung des Termins, den der Rückblick oben angekündigt hat.
const postRetreatEn = await create('community_posts', {
  type: 'post',
  title: 'Next sunrise retreat: second week of November',
  body: 'Several of you asked in English, so here it is in English too. Three days, twelve people, one beach. We start each morning in the dark, walk five minutes to the water and practice while the light comes over the crater. Nothing else is scheduled.\n\nThe exact weekend still goes up as a poll — but if you are flying in from far away, hold that week. Bring a mat you do not mind getting sandy.',
  ...LENA, status: 'published', scheduledAt: null, publishedAt: daysAgo(0, 3),
  pollOptions: null, pollEndsAt: null, upvotes: 15, downvotes: 1, score: 14,
}, [READ_ANY])

// Geplanter Post: im öffentlichen Feed unsichtbar (read nur Autor), erscheint
// im Dashboard unter „Geplant" — und published sich nach Ablauf selbst
// (publishDuePosts beim ersten Feed-GET danach).
await create('community_posts', {
  type: 'post',
  title: 'Ankündigung: Kurs „Mobility am Morgen" startet nächste Woche',
  body: 'Vier Wochen, jeden zweiten Tag zehn Minuten — Handgelenke, Schultern, Hüfte. Anmeldung öffnet mit diesem Beitrag automatisch. (Dieser Post wurde im Voraus geplant.)',
  ...LENA, status: 'scheduled', scheduledAt: daysAhead(7), publishedAt: null,
  pollOptions: null, pollEndsAt: null, upvotes: 0, downvotes: 0, score: 0,
}, [Permission.read(Role.user(LENA.authorId))])
console.log('  9 veröffentlicht (5 de / 4 en) + 1 geplant')

// Poll-Stimmen (Zählung läuft über poll_votes-Rows, nicht über Zähler)
const pollSpread = [[ANNA, 0], [JONAS, 1], [MIRIAM, 1], [TOBI, 3], [GRACE, 1], [NALANI, 2], [{ authorId: 'demo-kim', authorName: 'Kim' }, 1], [{ authorId: 'demo-lea', authorName: 'Lea' }, 3]]
for (const [who, optionIndex] of pollSpread) {
  await create('poll_votes', { postId: postPoll.$id, userId: who.authorId, optionIndex })
}
// Ein paar Post-Votes als echte Rows (Zähler oben sind autoritativ gesetzt)
const postVotes = [
  [ANNA, postRoutine.$id, 1], [JONAS, postRoutine.$id, 1], [TOBI, postWrists.$id, 1], [MIRIAM, postRetreat.$id, 1],
  [GRACE, postRetreatEn.$id, 1], [NALANI, postRetreatEn.$id, 1], [ANNA, postThirty.$id, 1],
  [NALANI, postHamstrings.$id, 1], [TOBI, postBilingual.$id, 1],
]
for (const [who, postId, value] of postVotes) {
  await create('post_votes', { postId, userId: who.authorId, value })
}
console.log(`  ${pollSpread.length} Poll-Stimmen, ${postVotes.length} Post-Votes`)

// ── 3. Kommentare (Homepage + Threads am Post) ──────────────────────────────
// Sprache folgt dem Beitrag: unter englischen Posts wird englisch geantwortet,
// unter deutschen deutsch — mit einzelnen bewussten Sprachwechseln.
console.log('\nKommentare …')
const commentCount = { active: 0, hidden: 0 }
async function comment({ target, targetUrl, author, content, parent = null, up = 0, down = 0, status = 'active', ageDays = 0, ageHours = 0 }) {
  void ageDays; void ageHours // $createdAt ist system-verwaltet — Alter nur der Lesbarkeit halber im Aufruf
  commentCount[status === 'hidden' ? 'hidden' : 'active']++
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

// Der Kommentar-Block der Startseite hängt an targetId 'home' — er ist damit
// FÜR BEIDE Sprachfassungen derselbe (die pages-Rows sind je locale getrennt,
// der Thread ist es nicht). Deshalb stehen hier bewusst beide Sprachen: was ein
// EN-Besucher unter der englischen Startseite liest, ist derselbe Thread.
const HOME = { id: 'home', type: 'page' }
await comment({ target: HOME, targetUrl: '/', author: ANNA, content: 'Hallo aus Freiburg! Seit dem Retreat letztes Jahr bin ich süchtig nach den Morgen-Flows. 🙋‍♀️', up: 5 })
await comment({ target: HOME, targetUrl: '/', author: JONAS, content: 'Hi! Kompletter Anfänger hier — die 5-Minuten-Einsteiger-Reihe ist genau mein Tempo.', up: 3 })
const homeLena = await comment({ target: HOME, targetUrl: '/', author: LENA, content: 'Willkommen euch beiden! Schreibt gern in den Feed, wenn ihr Fragen habt — hier liest die ganze Community mit. 💛', up: 4 })
await comment({ target: HOME, targetUrl: '/', author: TOBI, content: 'Aloha! Bin über die Demo hier gelandet und geblieben. 😄', parent: homeLena, up: 2 })
const homeGrace = await comment({ target: HOME, targetUrl: '/', author: GRACE, content: 'Hi from Portland! A friend of mine did the retreat last year and would not stop talking about it. I have been reading quietly for a month — today I am saying hello. 👋', up: 4 })
await comment({ target: HOME, targetUrl: '/', author: LENA, content: 'Welcome, Grace — reading quietly counts too. Whenever you feel like it, the feed is the fastest way to reach me, in English or in German. 💛', parent: homeGrace, up: 3 })

const WRISTS = { id: postWrists.$id, type: 'post' }
const tip1 = await comment({ target: WRISTS, targetUrl: '/feed', author: TOBI, content: 'Was mir geholfen hat: Fäuste statt flacher Hände (auf einer weichen Matte) — nimmt sofort Druck aus dem Gelenk.', up: 6 })
await comment({ target: WRISTS, targetUrl: '/feed', author: MIRIAM, content: 'Danke dir! Fäuste probiere ich morgen früh direkt aus. 🙏', parent: tip1, up: 2 })
const tip2 = await comment({ target: WRISTS, targetUrl: '/feed', author: LENA, content: 'Guter Tipp von Tobi! Zusätzlich: Delfin statt Hund als Alternative (Unterarme am Boden), und vorher die Handgelenke kreisen — 30 Sekunden reichen. Wenn es länger als zwei Wochen zwickt, bitte ärztlich abklären (Hausregel 3 💛).', up: 8 })
await comment({ target: WRISTS, targetUrl: '/feed', author: ANNA, content: 'Delfin hat bei mir damals den Unterschied gemacht — seither null Probleme.', parent: tip2, up: 3 })

const ROUTINE = { id: postRoutine.$id, type: 'post' }
await comment({ target: ROUTINE, targetUrl: '/feed', author: JONAS, content: 'Kaffee. Immer Kaffee. Ich bin ehrlich. ☕', up: 4 })
await comment({ target: ROUTINE, targetUrl: '/feed', author: MIRIAM, content: 'Matte zuerst — sonst gewinnt das Sofa.', up: 5 })
// Sprachwechsel unter einem deutschen Beitrag — so klingt eine echte gemischte
// Community (und der EN-Besucher sieht, dass er hier mitreden darf).
await comment({ target: ROUTINE, targetUrl: '/feed', author: GRACE, content: 'Coffee. Obviously coffee. I ran the German through a translator and I still say coffee. ☕', up: 4 })

// Thread der englischen Frage: Antworten in der Sprache der Frage.
const HAMSTRINGS = { id: postHamstrings.$id, type: 'post' }
const hamNalani = await comment({ target: HAMSTRINGS, targetUrl: '/feed', author: NALANI, content: 'Two things changed it for me: sit up on a folded blanket so your hips are higher than your knees, and stop trying to get flat. A pull right behind the knee usually means the hamstring is being asked to do the hip crease\'s job.', up: 7 })
const hamLena = await comment({ target: HAMSTRINGS, targetUrl: '/feed', author: LENA, content: 'Exactly this. And a sharp pull right behind the knee is your cue to back off — that spot is tendon, not muscle. Try it with a strap around the arches, knees soft, and let the middle of the thigh do the stretching. If it stays sharp for more than a week or two, please have someone look at it (house rule 3 💛).', parent: hamNalani, up: 9 })
await comment({ target: HAMSTRINGS, targetUrl: '/feed', author: GRACE, content: 'Blanket and strap tomorrow morning, then. Thank you both — this is the first answer that explained the *why*.', parent: hamLena, up: 4 })
await comment({ target: HAMSTRINGS, targetUrl: '/feed', author: MIRIAM, content: 'Same here — die Decke unter dem Sitzbein war für mich der Unterschied. Sorry for the German! 😄', up: 3 })

const THIRTY = { id: postThirty.$id, type: 'post' }
await comment({ target: THIRTY, targetUrl: '/feed', author: ANNA, content: 'The phone part is the real trick. Congratulations — 30 in a row is 30 more than most of us manage. 🎉', up: 5 })
await comment({ target: THIRTY, targetUrl: '/feed', author: LENA, content: 'This is my favourite kind of report. Nothing about the pose, everything about the morning. 🌅', up: 6 })

const RETREAT_EN = { id: postRetreatEn.$id, type: 'post' }
const retreatGrace = await comment({ target: RETREAT_EN, targetUrl: '/feed', author: GRACE, content: 'Flying in from Portland if I get a spot — is Thursday evening too early to arrive?', up: 2 })
await comment({ target: RETREAT_EN, targetUrl: '/feed', author: LENA, content: 'Thursday is perfect, the water is calmer in the evening anyway. Bring one warm layer for the crater — it is cold up there before sunrise, every single time.', parent: retreatGrace, up: 3 })

const BILINGUAL = { id: postBilingual.$id, type: 'post' }
await comment({ target: BILINGUAL, targetUrl: '/feed', author: TOBI, content: 'Sehr gut. Mein Englisch ist mittelprächtig, aber lesen geht — und Nalanis Tipps sind es wert. 😄', up: 3 })
await comment({ target: BILINGUAL, targetUrl: '/feed', author: NALANI, content: 'Mahalo for saying it out loud. Half of my family talks like this anyway — two languages in one sentence.', up: 4 })

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
console.log(`  ${commentCount.active} sichtbar (2 Ebenen, de+en), ${commentCount.hidden} versteckt (Spam), 3 offene Meldungen`)

// Kommentar-Votes als echte Rows für die Top-Kommentare
const commentVotes = [[ANNA, tip1], [JONAS, tip2], [TOBI, tip2], [MIRIAM, homeLena], [GRACE, hamNalani], [NALANI, hamLena], [ANNA, hamLena], [JONAS, homeGrace]]
for (const [who, row] of commentVotes) {
  await create('comment_votes', { commentId: row.$id, userId: who.authorId, value: 1 })
}

console.log('\n✔ Morgenlicht steht. Kontrolle: https://demo.pukalani.app (EN-Startseite mit Kommentaren) und https://demo.pukalani.app/de (DE-Fassung derselben Seite), /feed bzw. /de/feed (deutsche + englische Beiträge, Poll, Frage) sowie /hausregeln, /ueber-mich — Spam-Kommentar nur im Dashboard sichtbar.')
