/**
 * Demo-Seed: Beispiel-User (mit Rollen) + Beispiel-Kommentare (Threads, Votes)
 * für die Live-Demo (Target demo-post/post). Bewusst mit XSS/Injection-Payloads,
 * um die sichere Darstellung (Vue-Autoescaping, kein v-html) zu verifizieren.
 *
 *   node --experimental-strip-types --env-file=apps/reddit-comments/.env \
 *     apps/reddit-comments/scripts/seed-demo.ts [--force]
 *
 * Idempotent: User werden über die E-Mail wiederverwendet; Kommentare werden nur
 * angelegt, wenn das Target noch leer ist (oder --force). Benötigte Key-Scopes:
 * users.*, tables.*, rows.*.
 */
import { Client, Users, TablesDB, ID, Permission, Role, Query, type Models } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY ?? process.env.NUXT_APPWRITE_MIGRATIONS_KEY
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — mit --env-file=apps/reddit-comments/.env aufrufen.')
  process.exit(1)
}
const force = process.argv.includes('--force')

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const users = new Users(client)
const tablesDB = new TablesDB(client)

const TARGET = { id: 'demo-post', type: 'post' }
const TABLE = 'comments'
const PASSWORD = 'Demo-Passw0rd!'

interface CommentRow extends Models.Row { rootId: string | null, depth: number, authorId: string, authorName: string, score: number }

// ── 1. User ────────────────────────────────────────────────────────────────
const userDefs = [
  { key: 'admin', name: 'Admin Alice', email: 'admin@demo.local', labels: ['admin'] },
  { key: 'mod', name: 'Mod Max', email: 'mod@demo.local', labels: ['moderator'] },
  { key: 'uma', name: 'Uma Ortega', email: 'uma@demo.local', labels: [] as string[] },
  { key: 'ben', name: 'Ben Kessler', email: 'ben@demo.local', labels: [] as string[] },
  { key: 'cara', name: 'Cara Nowak', email: 'cara@demo.local', labels: [] as string[] },
  { key: 'tom', name: 'Tom Troll', email: 'tom@demo.local', labels: [] as string[] },
]

const U: Record<string, Models.User<Models.Preferences>> = {}
for (const def of userDefs) {
  let user: Models.User<Models.Preferences>
  try {
    user = await users.create({ userId: ID.unique(), email: def.email, password: PASSWORD, name: def.name })
    console.log(`✔ User ${def.name} <${def.email}>`)
  }
  catch (error) {
    // 409 → existiert schon: über die E-Mail wiederfinden
    const found = await users.list({ queries: [Query.equal('email', def.email), Query.limit(1)] })
    if (!found.users[0]) throw error
    user = found.users[0]
    console.log(`↷ User ${def.name} existiert bereits`)
  }
  if (def.labels.length) await users.updateLabels({ userId: user.$id, labels: def.labels })
  U[def.key] = user
}

// ── 2. Kommentare ────────────────────────────────────────────────────────────
const existing = await tablesDB.listRows<CommentRow>({
  databaseId, tableId: TABLE,
  queries: [Query.equal('targetId', TARGET.id), Query.equal('targetType', TARGET.type), Query.limit(1)],
})
if (existing.total > 0 && !force) {
  console.log(`↷ Target ${TARGET.id} hat bereits ${existing.total} Kommentare — Seed übersprungen (--force zum Erzwingen).`)
  process.exit(0)
}

async function add(author: Models.User<Models.Preferences>, content: string, parent?: CommentRow): Promise<CommentRow> {
  const row = await tablesDB.createRow<CommentRow>({
    databaseId, tableId: TABLE, rowId: ID.unique(),
    data: {
      targetId: TARGET.id, targetType: TARGET.type, content,
      authorId: author.$id, authorName: author.name,
      parentId: parent ? parent.$id : null,
      rootId: parent ? (parent.rootId ?? parent.$id) : null,
      depth: parent ? parent.depth + 1 : 0,
      targetUrl: '/', editedAt: null,
      upvotes: 0, downvotes: 0, score: 0, status: 'active',
    },
    permissions: [Permission.update(Role.user(author.$id)), Permission.delete(Role.user(author.$id))],
  })
  return row
}

async function vote(comment: CommentRow, voters: Models.User<Models.Preferences>[], value: 1 | -1) {
  for (const v of voters) {
    await tablesDB.createRow({
      databaseId, tableId: 'comment_votes', rowId: ID.unique(),
      data: { commentId: comment.$id, userId: v.$id, value },
      permissions: [Permission.update(Role.user(v.$id)), Permission.delete(Role.user(v.$id))],
    }).catch(() => {})
  }
  const up = value === 1 ? voters.length : 0
  const down = value === -1 ? voters.length : 0
  await tablesDB.updateRow({ databaseId, tableId: TABLE, rowId: comment.$id, data: { upvotes: up, downvotes: down, score: up - down } })
}

// Normale, realistische Reddit-artige Diskussion
const c1 = await add(U.uma, 'Krass, wie flüssig das hier läuft — sogar auf dem Handy. Respekt! 🔥')
const c1r1 = await add(U.ben, 'Ja, die Realtime-Updates poppen sofort auf. Wie ist das gebaut?', c1)
await add(U.uma, 'Soweit ich weiß Appwrite + Nuxt. Der SSR-Teil macht die erste Ladung schnell.', c1r1)
const c1r2 = await add(U.cara, 'Mich überzeugt vor allem die Moderation — sauber gelöst.', c1)
await add(U.mod, 'Danke! Melden geht pro User genau einmal, und wir sehen die Melder-Anzahl. 🙌', c1r2)

const c2 = await add(U.ben, 'Kann man Kommentare eigentlich bearbeiten? *edit:* ja, man kann 😄')
await add(U.cara, 'Der „bearbeitet"-Hinweis ist ein nettes Detail.', c2)

const c3 = await add(U.admin, 'Kleiner Hinweis vom Team: Wir testen gerade neue Themes. Feedback willkommen!')
await add(U.uma, 'Das Midnight-Theme ist mein Favorit. ✨', c3)

// Sonderzeichen / Unicode / Markdown-artig (Darstellung prüfen)
await add(U.cara, 'Unicode-Test: café · naïve · 你好 · العربية · 😀🎉 — und <b>kein</b> echtes Bold.')
await add(U.ben, 'Zeilen\numbruch\nund   mehrere    Leerzeichen — bleibt die Formatierung erhalten?')

// ── Security: bewusste XSS/Injection-Payloads (müssen escaped erscheinen) ─────
const xss = [
  `<script>alert('xss-1')</script>`,
  `<img src=x onerror="alert('xss-2')">`,
  `<a href="javascript:alert('xss-3')">bitte klicken</a>`,
  `"><script>alert('xss-4')</script>`,
  `<svg onload=alert('xss-5')>`,
  `<iframe src="javascript:alert('xss-6')"></iframe>`,
  `'; DROP TABLE comments; -- und {{constructor.constructor('alert(7)')()}}`,
  `[böser link](javascript:alert('xss-8')) plus ![img](x onerror=alert(9))`,
]
const cX = await add(U.tom, `Mal sehen, ob das hier durchgeht: ${xss[0]}`)
for (let i = 1; i < xss.length; i++) await add(U.tom, xss[i], i % 2 === 0 ? cX : undefined)

// Ein paar Votes für Realismus
await vote(c1, [U.ben, U.cara, U.mod, U.admin], 1)
await vote(c3, [U.uma, U.cara], 1)
await vote(cX, [U.uma, U.ben, U.cara], -1)

const after = await tablesDB.listRows({ databaseId, tableId: TABLE, queries: [Query.equal('targetId', TARGET.id), Query.limit(1)] })
console.log(`\n✔ Seed fertig: ${userDefs.length} User, ${after.total} Kommentare (inkl. ${xss.length} XSS-Payloads). Passwort aller Demo-User: ${PASSWORD}`)
