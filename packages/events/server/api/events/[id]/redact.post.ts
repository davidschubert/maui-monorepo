import { canRedactEvent, eventIsRedacted } from '../../../../shared/eventModerationPolicy'
import { EVENTS_TABLE, EVENT_COVERS_BUCKET, type EventRow } from '../../../../shared/types/event'

/**
 * Moderation: den Text eines ABGESAGTEN Termins schwärzen (F46, 2026-08-03 —
 * Davids Entscheidung).
 *
 * Jeder vom Autor gewählte Text wird geleert (Titel, Beschreibung, Ort,
 * Adresse, Ortshinweise, beide Links), der Marker `redactedAt` gesetzt, das
 * Titelbild gelöscht. Der Status bleibt `cancelled`, das Leserecht bleibt: wer
 * zugesagt hat, sieht weiterhin, DASS abgesagt wurde — nur den Text nicht mehr.
 * VERWORFEN wurde ausdrücklich „ausblenden und die Zusagenden benachrichtigen":
 * teurer (eine Mail je Zusage) und die Absage verschwände für alle, die die
 * Nachricht nicht lesen.
 *
 * DER NAME IST EIN FALSCHER FREUND, deshalb einmal ausgeschrieben: „redact"
 * heißt hier SCHWÄRZEN (Text unkenntlich machen). Das gleichnamige deutsche
 * Wort „Redaktion" — die Termin-VERWALTUNG durch Editoren — steckt im
 * bestehenden `tests/redaction-actor.test.ts` und meint etwas völlig anderes.
 * Wer hier etwas anfasst, sollte die beiden nicht verwechseln.
 *
 * DAS TITELBILD WIRD GELÖSCHT, NICHT UMPERMISSIONIERT — und genau hier liegt der
 * Unterschied zum Ausblenden. `applyEventCoverVisibility` gleicht die Datei an
 * die READ-Einträge ihrer ROW an („ein Cover ist nie offener als sein Termin",
 * coverAudience.ts). Beim Ausblenden wird die Row dicht, also wird es die Datei
 * gleich mit. Ein geschwärzter Termin bleibt aber ABSICHTLICH lesbar — die Row
 * behält ihr Publikum, und damit behielte es auch das Bild. Ein Aufruf von
 * `applyEventCoverVisibility` wäre hier also folgenlos, kein Schutz. Es gibt
 * keine zweite Wahrheit über Dateirechte, die man stattdessen setzen könnte;
 * bleibt nur, die Datei zu ENTFERNEN — wie `cover.delete.ts` es tut: erst die
 * Row (coverFileId null), dann die Datei best-effort.
 *
 * DIE SCHWÄRZUNG IST UNUMKEHRBAR, und das ist Absicht. Es gibt kein
 * „restore" wie beim Ausblenden: eine Kopie des Originaltextes irgendwo
 * aufzubewahren hieße, genau den Inhalt weiter vorzuhalten, dessentwegen
 * jemand eingegriffen hat. Deshalb steht in der Oberfläche eine Rückfrage vor
 * dem Klick — die Sicherung gehört vor die Tat, nicht dahinter.
 *
 * WER HANDELT (C1c): KEIN `actor` — Moderation, wie hide/restore. Der Default
 * ist damit die Türklinke `operator`, und das ist hier beides richtig: die
 * M13-Inhalts-Sperre lässt Moderation ausdrücklich durch (eine wegen
 * Zahlungsverzug gesperrte Community muss moderierbar bleiben), und ein
 * A5-Beitritt wäre falsch — wer moderiert, handelt nicht in eigener Sache.
 *
 * PRODUKT-GATE (P4) UND AUTORISIERUNG: identisch zu `hide`/`restore` und aus
 * denselben Gründen — `requirePlanProduct(event, 'events')` vor
 * `await requireCommunityPermission(event, 'events.moderate')`. Ausführlich im
 * Kopf von `hide.post.ts`. Das `await` ist Pflicht, ohne wäre der Gate
 * fail-open; `tests/event-redact-authz.test.ts` nagelt beides an die
 * Geschwister-Routen.
 *
 * KEIN AUDIT-EINTRAG — bewusst, obwohl der Originaltext danach weg ist:
 * 1. `recordAudit()` gehört dem ADMIN-Layer. Ein Produkt-Layer, der ihn ruft,
 *    hinge über einen impliziten Auto-Import an einem anderen Produkt-Layer —
 *    genau die Kopplung, die A14 verbietet. In einer Silo-App mit events, aber
 *    ohne admin, wäre die Funktion zur Laufzeit schlicht nicht da, und die
 *    Schwärzung stürbe in genau dem Moment, in dem sie gebraucht wird.
 * 2. Das Protokoll steht ohnehin auf der Zeile: `redactedAt` ist dauerhaft und
 *    in der Queue sichtbar — die TATSACHE und der ZEITPUNKT sind festgehalten,
 *    wo die Leute nachsehen, die es angeht.
 * 3. Das WER gehört bewusst nicht dorthin (s. `EventRow.redactedAt`): die Zeile
 *    ist öffentlich lesbar. Wollte man Rechenschaft über Moderations-
 *    entscheidungen, gehörte sie als EIN expliziter Vertrag für ALLE
 *    Moderations-Aktionen gebaut (hide, restore, schwärzen, Kommentare,
 *    Beiträge) — heute protokolliert nämlich keine davon etwas. Diese eine
 *    Route zum Sonderfall zu machen, gäbe eine Lückenlosigkeit vor, die es
 *    nicht gibt.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'events')
  const { user } = await requireCommunityPermission(event, 'events.moderate')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  // Datentür als Operator: get belegt die Zugehörigkeit (fremder Mandant → 404),
  // erst dann wird moderiert.
  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  const verdict = canRedactEvent(row.status)
  if (!verdict.allowed) {
    throw createError({
      status: 409,
      statusText: 'Only cancelled events can be redacted',
      data: { code: verdict.reason },
    })
  }

  // IDEMPOTENT statt 409: ein zweiter Klick ändert nichts, und ein Fehler für
  // einen bereits erreichten Zustand wäre nur Lärm. Der ursprüngliche Zeitpunkt
  // bleibt dabei stehen — er ist das Protokoll, ihn zu überschreiben verlöre die
  // einzige Angabe, wann eingegriffen wurde.
  if (eventIsRedacted(row.redactedAt)) {
    return { ok: true }
  }

  /**
   * EIN Schreibvorgang für Text UND Marker: sie sind dieselbe Aussage. Ein
   * zweiter Schritt könnte scheitern und hinterließe entweder leeren Text ohne
   * Erklärung oder eine Erklärung ohne Wirkung.
   *
   * GESCHWÄRZT WIRD JEDER TEXT, DEN DER AUTOR GEWÄHLT HAT (Davids Entscheidung
   * 2026-08-03, erweitert nach dem ersten Schnitt): Titel, Beschreibung, Ort,
   * Adresse, Ortshinweise UND die beiden Links. Der erste Schnitt hatte nur
   * Titel und Beschreibung geleert und die übrigen fünf Felder als benannte
   * Lücke stehen gelassen — das verschiebt das Problem aber nur eine Zeile
   * tiefer: sie stehen auf derselben Seite, und ein Link auf eine anstößige
   * Seite ist derselbe Fall wie ein anstößiger Titel. Ein Werkzeug, das man
   * durch die Wahl des Feldes umgeht, ist keines.
   *
   * WARUM DAS BEI EINER ABSAGE VERTRETBAR IST: der Termin ist abgesagt. Der
   * Informationswert von Ort und Link ist damit erloschen — worauf die
   * Zusagenden ein Anrecht haben, ist die TATSACHE der Absage, und die trägt
   * `status`, nicht der Text.
   *
   * `organizerName` bleibt BEWUSST stehen: das ist Identität, nicht Inhalt. Sie
   * zu entfernen nähme die Zurechenbarkeit — mit dem Autor befasst man sich
   * über Mitgliedschaft und Rolle (A5), nicht über das Anonymisieren seines
   * abgesagten Termins.
   */
  await db.update<EventRow>(EVENTS_TABLE, id, {
    title: '',
    description: '',
    location: null,
    address: null,
    locationNotes: null,
    url: null,
    replayUrl: null,
    coverFileId: null,
    redactedAt: new Date().toISOString(),
  }).catch((error) => { throw toH3Error(error, 'Could not redact event') })

  // Die Datei danach und best-effort (Muster cover.delete.ts): die Row ist die
  // Wahrheit, sie zeigt schon auf nichts mehr. Eine verwaiste Datei im Bucket
  // ist Müll, kein Leck — der Weg zu ihr führte über `coverFileId`.
  if (row.coverFileId) {
    await createAdminClient(event).storage
      .deleteFile({ bucketId: EVENT_COVERS_BUCKET, fileId: row.coverFileId })
      .catch((error) => {
        console.error(`[events] Titelbild ${row.coverFileId} des geschwärzten Events ${id} konnte nicht gelöscht werden — die Datei bleibt im Bucket abrufbar:`, error)
      })
  }

  // Schwärzen schließt die offenen Meldungen (moderation-Vertrag) — der Anlass
  // ist erledigt. `resolution: 'redacted'` statt 'hidden': der Termin ist NICHT
  // ausgeblendet, und ein falsches Wort im Protokoll ist schlimmer als keines.
  // Best-effort wie beim Ausblenden: die Schwärzung ist bereits passiert.
  await resolveReportsForTarget(event, 'event', id, 'redacted', user.$id)
    .catch(error => console.error(`[events] Meldungen zu Event ${id} konnten nicht aufgelöst werden:`, error))

  /**
   * Auch der Activity-Feed muss den Text loswerden. Seine Einträge tragen einen
   * eigenen metadata-SCHNAPPSCHUSS des Titels ('event.published',
   * 'event.replay_published') — der überlebt jede Änderung an der Zeile. Ohne
   * diesen Schritt stünde der geschwärzte Titel im Feed weiter da, und die
   * Schwärzung wäre eine Attrappe. Dasselbe tut `hide.post.ts` aus demselben
   * Grund.
   */
  await removeActivitiesForObject(event, { objectType: 'event', objectId: id })

  // Dieselbe Antwortform wie hide/restore — die Queue lädt danach neu.
  return { ok: true }
})
