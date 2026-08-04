import { Query } from 'node-appwrite'
import { periodStartIso } from '../../../../shared/discussionSort'
import { POSTS_TABLE, type DiscussionAboutResponse } from '../../../../shared/types/post'

/**
 * Die Zahlen der About-Seite (F1 Stufe 2, Konzept § 3.4).
 *
 * ── DIE EHRLICHKEITS-KLAUSEL ──────────────────────────────────────────────
 * Davids Katalog nennt acht Kennzahlen. Vier davon haben hier KEINE Quelle, und
 * sie stehen deshalb nicht in der Antwort — auch nicht als 0, auch nicht als
 * Schätzung. Dieselbe Regel, die in Stufe 1 die Sortierung „Hot" verhindert hat:
 * eine Zahl, hinter der nichts steht, ist schlimmer als eine fehlende, weil sie
 * geglaubt wird.
 *
 * WAS FEHLT UND WARUM (damit niemand es „nachreicht", ohne den Preis zu kennen):
 *
 *  - **„N aktive Nutzer in 7 Tagen".** Es gibt keine Quelle für „aktiv" im Sinne
 *    von ANWESEND. Die Presences-API kennt nur „jetzt online"; die
 *    `activities`-Tabelle kennt nur, wer etwas GESCHRIEBEN hat — das ist eine
 *    andere Zahl (Leser sind die Mehrheit) und ließe sich obendrein nicht
 *    zählen, weil Appwrite kein DISTINCT über eine Spalte kann. Ehrlich wäre
 *    erst eine eigene Besuchs-Erfassung je Person: neue Infrastruktur UND eine
 *    personenbezogene Sammlung, die es hier bewusst nicht gibt (F18).
 *  - **„N Beitritte in 7 Tagen".** Die Wahrheit steht in `community_members` —
 *    im CONTROL PLANE, einem anderen Appwrite-Projekt. Dafür bräuchte es eine
 *    neue Service-Route über die Naht. Machbar, aber kein Nebenprodukt einer
 *    Statistik-Kachel.
 *  - **„N Likes insgesamt".** Appwrite kann nicht summieren. Die Zahl hieße,
 *    jede Beitrags-Zeile der Community zu lesen und im Speicher zu addieren —
 *    bei jedem Aufruf der Seite.
 *  - **„Gegründet vor N Monaten".** `communities.$createdAt` gehört ebenfalls
 *    dem Control Plane und steht im Mandanten-Kontext nicht. Der älteste
 *    Beitrag wäre ein NAHELIEGENDER Ersatz und genau deshalb gefährlich: er
 *    beantwortet eine andere Frage („wann wurde hier zuerst geschrieben") und
 *    sähe trotzdem wie ein Gründungsdatum aus.
 *
 * WAS BLEIBT, ist aus `community_posts` gerechnet und damit belegbar. Vier
 * `count`-Abfragen, keine Zeile wird übertragen.
 *
 * ÖFFENTLICH wie die Topic-Liste: dieselbe Datentür (Mitglieder-Klinke), also
 * sieht ein Gast in einer geschlossenen Community keine Zeilen und damit
 * Nullen. Das ist richtig so — die Zahl ist eine Auskunft über Inhalte, die er
 * nicht lesen darf.
 */
export default defineEventHandler(async (event): Promise<DiscussionAboutResponse> => {
  requirePlanProduct(event, 'posts')

  const db = tenantDb(event)

  // Dieselben Zeitfenster wie die Sortierung „Top" — die Funktion ist pure und
  // unit-getestet, inklusive der Unterscheidung „heute = Kalendertag" gegen
  // „Woche = rollierendes Fenster". Sie ein zweites Mal hier zu rechnen hieße,
  // zwei Wahrheiten über dasselbe Wort zu pflegen.
  const weekAgo = periodStartIso('week')
  const todayStart = periodStartIso('today')

  const published = [Query.equal('status', 'published')]
  // „Topic" heißt: Beitrag MIT Kategorie (siehe index.get.ts). Der Feed-Beitrag
  // ohne Kategorie ist kein Thema der Discussions.
  const topic = [...published, Query.notEqual('categoryId', '')]

  const [topicsTotal, topicsLast7Days, postsToday, categories] = await Promise.all([
    db.count(POSTS_TABLE, topic).catch(() => 0),
    db.count(POSTS_TABLE, [...topic, ...(weekAgo ? [Query.greaterThanEqual('publishedAt', weekAgo)] : [])]).catch(() => 0),
    // BEWUSST OHNE Kategorie-Filter: „Beiträge heute" zählt den ganzen Strom.
    // Davids Entscheidung 2 sagt, eine Community hat EINEN Ort — der Feed ist
    // der Strom über alles, Discussions die gegliederte Sicht darauf. Eine Zahl,
    // die nur die kategorisierte Hälfte zählte, hieße dasselbe wie die Zeile
    // darüber und wäre doppelt gemoppelt.
    db.count(POSTS_TABLE, [...published, ...(todayStart ? [Query.greaterThanEqual('publishedAt', todayStart)] : [])]).catch(() => 0),
    listCategories(db, { activeOnly: true }).then(rows => rows.length).catch(() => 0),
  ])

  return { topicsTotal, topicsLast7Days, postsToday, categories }
})
