import { Client, TablesDB, Query } from 'node-appwrite'
const c = new Client().setEndpoint(process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT).setProject(process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID).setKey(process.env.NUXT_APPWRITE_KEY)
const db = new TablesDB(c); const DB = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

// Englische Variante je Version (Backfill der bestehenden deutschen Einträge).
const EN = {
  'v0.1': { titleEn: `Foundation & sign-in`, bodyEn: `Platform launch: secure server-side authentication (login & registration), a design system, light/dark capable and bilingual (German/English) from day one.` },
  'v0.2': { titleEn: `Comment system`, bodyEn: `Reddit-style commenting: nested threads, up/down votes, sorting (top/new/controversial) and new posts that appear instantly.` },
  'v0.3': { titleEn: `Admin dashboard & moderation`, bodyEn: `New admin dashboard with user management and comment moderation (hide/restore). Login is now also protected against brute-force attacks.` },
  'v0.4': { titleEn: `Themes & appearance`, bodyEn: `Several color worlds to choose from, light/dark/system mode and language selection right in the header.` },
  'v0.5': { titleEn: `Passwordless & auth polish`, bodyEn: `Sign in with a one-time code (no password), password reset, a password-strength meter on registration and thoroughly tidied-up forms.` },
  'v0.6': { titleEn: `Multilingual & clean links`, bodyEn: `Reworked language handling (English without a prefix, German under /de) and consistent, canonical URLs without trailing slashes.` },
  'v0.7': { titleEn: `Profile, avatars & devices`, bodyEn: `Profile photo upload (drag & drop, WebP preview), a phone number in your profile, plus a device/session overview with sign-out — individually or everywhere.` },
  'v0.8': { titleEn: `Admin expansion: detail pages, audit & search`, bodyEn: `Detailed user pages, grant/revoke roles, an activity log, an activity chart, a storage browser and global search via ⌘K — plus a system overview.` },
  'v0.9': { titleEn: `Feature flags, notifications & GDPR`, bodyEn: `Runtime switches for registration/comments/maintenance, in-app notifications (bell) and GDPR self-service: export your data or delete your account.` },
  'v1.0': { titleEn: `Real-time everywhere`, bodyEn: `Live updates across the whole product: comments, votes, moderation, metrics and configuration switches update in real time — no reload. Sessions can be revoked instantly.` },
  'v1.1': { titleEn: `Theme picker & new neutral tones`, bodyEn: `The neutral color is now selectable (9 palettes) with a subtly cooler default tone — for a more modern, calmer look.` },
  'v1.2': { titleEn: `Online presence & "typing…"`, bodyEn: `See who's around: a live online counter with avatar group on the dashboard, an online dot and a sortable "Active now" column in the user list, plus "typing…" in comment threads.` },
  'v1.3': { titleEn: `Dashboard home, tables & stability`, bodyEn: `An upgraded dashboard home (greeting, metrics with trend, "To moderate" and "Recent activity"), sortable tables, working pagination and login/logout in the activity log — plus many detail fixes.` },
  'v1.4': { titleEn: `"What's new"`, bodyEn: `This changelog: maintained in the dashboard, with a hint badge whenever there's something new.` },
}

const res = await db.listRows({ databaseId: DB, tableId: 'changelog', queries: [Query.limit(100)] })
let updated = 0
for (const r of res.rows) {
  const en = EN[r.version]
  if (!en) { console.log('? keine EN-Übersetzung für', r.version, '—', r.title); continue }
  await db.updateRow({ databaseId: DB, tableId: 'changelog', rowId: r.$id, data: en })
  console.log('+', r.version, '→', en.titleEn)
  updated++
}
console.log(`\n${updated} Einträge mit englischer Variante aktualisiert.`)
