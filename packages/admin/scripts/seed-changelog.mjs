import { Client, TablesDB, ID } from 'node-appwrite'
const c = new Client().setEndpoint(process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT).setProject(process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID).setKey(process.env.NUXT_APPWRITE_KEY)
const db = new TablesDB(c); const DB = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const ENTRIES = [
  { version: 'v0.1', date: '2026-06-09T10:00:00.000Z', category: 'feature', title: 'Fundament & Anmeldung',
    body: 'Start der Plattform: sichere serverseitige Anmeldung (Login & Registrierung), ein Design-System, Hell-/Dunkel-fähig und von Anfang an zweisprachig (Deutsch/Englisch).' },
  { version: 'v0.2', date: '2026-06-10T09:00:00.000Z', category: 'feature', title: 'Kommentarsystem',
    body: 'Reddit-artiges Kommentieren: verschachtelte Threads, Up-/Downvotes, Sortierung (Top/Neu/Kontrovers) und sofort erscheinende neue Beiträge.' },
  { version: 'v0.3', date: '2026-06-10T13:00:00.000Z', category: 'feature', title: 'Admin-Dashboard & Moderation',
    body: 'Neues Admin-Dashboard mit Benutzerverwaltung und Kommentar-Moderation (ausblenden/wiederherstellen). Der Login ist zusätzlich gegen Brute-Force geschützt.' },
  { version: 'v0.4', date: '2026-06-10T17:00:00.000Z', category: 'feature', title: 'Themes & Erscheinungsbild',
    body: 'Mehrere Farbwelten zur Auswahl, Hell-/Dunkel-/System-Modus und Sprachwahl bequem im Kopfbereich.' },
  { version: 'v0.5', date: '2026-06-12T10:00:00.000Z', category: 'improvement', title: 'Passwortlos & Auth-Feinschliff',
    body: 'Anmeldung per Einmal-Code (ohne Passwort), Passwort-Zurücksetzen, eine Passwortstärke-Anzeige bei der Registrierung und rundum aufgeräumte Formulare.' },
  { version: 'v0.6', date: '2026-06-13T10:00:00.000Z', category: 'improvement', title: 'Mehrsprachigkeit & saubere Links',
    body: 'Überarbeitete Sprachführung (Englisch ohne Präfix, Deutsch unter /de) und einheitliche, kanonische URLs ohne Trailing-Slash.' },
  { version: 'v0.7', date: '2026-06-17T10:00:00.000Z', category: 'feature', title: 'Profil, Avatare & Geräte',
    body: 'Profilfoto-Upload (Drag & Drop, WebP-Vorschau), Telefonnummer im Profil sowie eine Geräte-/Sitzungsübersicht mit Abmelden – einzeln oder überall.' },
  { version: 'v0.8', date: '2026-06-18T10:00:00.000Z', category: 'feature', title: 'Admin-Ausbau: Detailseiten, Audit & Suche',
    body: 'Detaillierte Benutzerseiten, Rollen vergeben/entziehen, ein Aktivitätsprotokoll, ein Aktivitäts-Chart, ein Speicher-Browser und globale Suche per ⌘K – plus eine System-Übersicht.' },
  { version: 'v0.9', date: '2026-06-18T16:00:00.000Z', category: 'feature', title: 'Feature-Flags, Benachrichtigungen & DSGVO',
    body: 'Laufzeit-Schalter für Registrierung/Kommentare/Wartung, In-App-Benachrichtigungen (Glocke) und DSGVO-Selfservice: Daten exportieren oder Konto löschen.' },
  { version: 'v1.0', date: '2026-06-20T10:00:00.000Z', category: 'feature', title: 'Realtime überall',
    body: 'Live-Updates im ganzen Produkt: Kommentare, Votes, Moderation, Kennzahlen und Konfigurationsschalter aktualisieren sich in Echtzeit – ohne Neuladen. Sitzungen lassen sich sofort widerrufen.' },
  { version: 'v1.1', date: '2026-06-20T16:00:00.000Z', category: 'improvement', title: 'Theme-Picker & neue Neutral-Töne',
    body: 'Die Neutral-Farbe ist jetzt wählbar (9 Paletten) mit einem dezent kühleren Standardton – für ein moderneres, ruhigeres Erscheinungsbild.' },
  { version: 'v1.2', date: '2026-06-21T10:00:00.000Z', category: 'feature', title: 'Online-Präsenz & „tippt gerade“',
    body: 'Sieh, wer gerade da ist: Live-Online-Zähler samt Avatar-Gruppe im Dashboard, Online-Punkt und sortierbare „Jetzt aktiv“-Spalte in der Benutzerliste, plus „tippt gerade“ in Kommentar-Threads.' },
  { version: 'v1.3', date: '2026-06-21T16:00:00.000Z', category: 'improvement', title: 'Dashboard-Startseite, Tabellen & Stabilität',
    body: 'Aufgewertete Dashboard-Startseite (Begrüßung, Kennzahlen mit Trend, „Zu moderieren“ und „Letzte Aktivität“), sortierbare Tabellen, funktionierende Pagination und Login/Logout im Aktivitätsprotokoll – dazu viele Detailkorrekturen.' },
  { version: 'v1.4', date: '2026-06-21T19:00:00.000Z', category: 'feature', title: '„Was ist neu“',
    body: 'Dieses Änderungsprotokoll: im Dashboard gepflegt, mit Hinweis-Badge, sobald es Neuigkeiten gibt.' },
]

// Reseed: vorhandene Einträge entfernen, dann frisch anlegen
const existing = await db.listRows({ databaseId: DB, tableId: 'changelog', queries: [] }).catch(() => ({ rows: [] }))
for (const r of existing.rows) await db.deleteRow({ databaseId: DB, tableId: 'changelog', rowId: r.$id }).catch(() => {})

for (const e of ENTRIES) {
  await db.createRow({ databaseId: DB, tableId: 'changelog', rowId: ID.unique(),
    data: { title: e.title, body: e.body, category: e.category, version: e.version, published: true, date: e.date } })
  console.log('+', e.version, e.title)
}
console.log(`\n${ENTRIES.length} Changelog-Einträge angelegt.`)
