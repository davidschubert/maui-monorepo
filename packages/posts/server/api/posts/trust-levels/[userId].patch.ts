import { trustLeaderSchema } from '../../../../schemas/trustLevel'

/**
 * Die Vertrauensstufe 4 („Leader") ernennen oder zurücknehmen (F1 Teilpaket 3,
 * Davids Entscheidung: „TL4 Leader: NUR von Hand — Owner ernennt/entzieht").
 *
 * ── DER EINZIGE HANDGRIFF AN EINER STUFE ──────────────────────────────────
 * Die Stufen 1–3 vergibt niemand: sie rechnen sich aus Zählern und Tagen
 * zusammen, und es gibt bewusst keine Route, die sie setzt — sonst wäre die
 * Schwelle nur noch ein Vorschlag. Hier geht es ausschließlich um die vierte,
 * und die ist keine Schwelle, sondern eine Ernennung.
 *
 * ── DER ENTZUG IST ERLAUBT, UND ER IST KEIN ABSTIEG ───────────────────────
 * „Kein Abstieg" gilt für das ERARBEITETE. Eine Ernennung zurückzunehmen ist
 * etwas anderes — sie war nie verdient, sondern gegeben. Darunter steht die
 * erarbeitete Stufe unverändert; genau dafür sind es zwei Spalten (posts-016).
 * Das ABZEICHEN bleibt trotzdem: verliehen ist verliehen.
 *
 * ── PROTOKOLLIERT WIRD ÜBER `logEvent`, NICHT ÜBER `audit_logs` ───────────
 * `recordAudit` gehört dem admin-Layer, und ein Produkt-Layer, der ihn ruft,
 * baut eine A14-Kopplung, die in einer Silo-App ohne admin zur Laufzeit ins
 * Leere greift — dieselbe Begründung, aus der `events/[id]/redact.post.ts` es
 * ausdrücklich nicht tut. Was hier passiert, gehört aber protokolliert: es
 * verschiebt Rechte über fremde Inhalte. `logEvent` ist der Weg, den core dafür
 * hat (dieselbe Stelle, an der auch das Operator-Break-Glass landet).
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'posts')
  const { user } = await requireCommunityPermission(event, 'posts.appoint')

  const userId = getRouterParam(event, 'userId')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Missing user id' })
  }

  /**
   * SICH SELBST ERNENNEN IST GEGENSTANDSLOS, sich selbst zu entziehen wäre eine
   * Falle. Der Owner hat ohnehin jedes der drei Stufen-Rechte über seine Rolle
   * — eine Ernennung an sich selbst änderte nichts und stünde nur verwirrend in
   * der Liste. Abgelehnt mit eigenem Grund, damit die Oberfläche es sagen kann
   * (Muster `communityTeam.ts`: „kein Selbst-Degradieren").
   */
  if (userId === user.$id) {
    throw createError({ status: 400, statusText: 'Cannot appoint yourself', data: { code: 'self_appoint' } })
  }

  const body = await readValidatedBody(event, trustLeaderSchema.parse)

  const level = await setTrustLevelLeader(event, userId, body.leader)
  if (level === null) {
    // Keine Zähler-Zeile heißt: dieser Mensch hat in dieser Community noch nie
    // etwas getan. Das ist kein Fehler des Aufrufers, sondern die Antwort —
    // deshalb 404 mit Grund und nicht 400.
    throw createError({ status: 404, statusText: 'No activity in this community', data: { code: 'no_counters' } })
  }

  logEvent('info', 'posts.trust_leader_changed', {
    communityId: event.context.tenant?.communityId ?? '',
    actorId: user.$id,
    userId,
    leader: body.leader,
  })

  return { ok: true, userId, leader: body.leader, level }
})
