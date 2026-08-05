import { Query } from 'node-appwrite'
import { communityContentIsPublic } from '../../../../../core/shared/communityAudience'
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
 * ── DIE FÜNFTE ZAHL KAM SPÄTER (F1, 2026-08-04) ───────────────────────────
 * „N Beitritte in 7 Tagen" stand hier bis dahin in der Liste oben: die
 * Wahrheit liegt in `community_members` im CONTROL PLANE. Sie kommt jetzt über
 * denselben Vertrag wie das Abzeichen „Jahrestag"
 * (`resolveRecentJoinCount` → core-Registry → control-Layer, verdrahtet in
 * apps/platform) — beide fragten dieselbe Tabelle, zwei Wege dorthin wären
 * zwei Wahrheiten gewesen.
 *
 * SIE ERSCHEINT NUR, WENN SIE ECHT IST. Ohne Naht (apps/comments, Silo,
 * Playground) oder bei einem Lesefehler ist die Antwort `null`, und dann fehlt
 * das Feld in der Antwort — die Kachel erscheint gar nicht. Eine 0 wäre genau
 * die Lüge, gegen die sich die Ehrlichkeits-Klausel oben entschieden hat.
 *
 * GESCHLOSSENE COMMUNITIES (C18): für GÄSTE fällt die Zahl weg, dieselbe Regel
 * wie bei der Team-Liste (onboarding/api/community/team). Dort ist jeder
 * Beitrag für ihn unsichtbar — die vier Zahlen oben stehen für ihn folglich auf
 * 0, und eine echte Beitritts-Zahl daneben wäre die einzige Auskunft, die aus
 * dem geschlossenen Raum dringt.
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

  // Für Gäste einer geschlossenen Community gar nicht erst fragen (siehe Kopf).
  const tenant = useTenant(event)
  const maySeeJoins = communityContentIsPublic(tenant) || Boolean(event.context.user)

  const [topicsTotal, topicsLast7Days, postsToday, categories, signups] = await Promise.all([
    db.count(POSTS_TABLE, topic).catch(() => 0),
    db.count(POSTS_TABLE, [...topic, ...(weekAgo ? [Query.greaterThanEqual('publishedAt', weekAgo)] : [])]).catch(() => 0),
    // BEWUSST OHNE Kategorie-Filter: „Beiträge heute" zählt den ganzen Strom.
    // Davids Entscheidung 2 sagt, eine Community hat EINEN Ort — der Feed ist
    // der Strom über alles, Discussions die gegliederte Sicht darauf. Eine Zahl,
    // die nur die kategorisierte Hälfte zählte, hieße dasselbe wie die Zeile
    // darüber und wäre doppelt gemoppelt.
    db.count(POSTS_TABLE, [...published, ...(todayStart ? [Query.greaterThanEqual('publishedAt', todayStart)] : [])]).catch(() => 0),
    listCategories(db, { activeOnly: true }).then(rows => rows.length).catch(() => 0),
    // SIEBEN TAGE wie die Zeile darüber — dieselbe Frage („was ist hier gerade
    // los?"), also dasselbe Fenster. Fail-soft steckt im Resolver: null.
    maySeeJoins ? resolveRecentJoinCount(event, 7) : null,
  ])

  return {
    topicsTotal,
    topicsLast7Days,
    postsToday,
    categories,
    // Das Feld FEHLT, wenn die Zahl unbekannt ist — es steht nie als 0 da.
    ...(signups === null ? {} : { signupsLast7Days: signups }),
  }
})
