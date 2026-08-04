import { decideCommunityAccess } from '../../../../../core/shared/communityAccess'
import { topicStateSchema } from '../../../../schemas/topicState'
import { decideTopicStateChange } from '../../../../shared/topicState'
import { POSTS_TABLE, type CommunityPost } from '../../../../shared/types/post'

/**
 * Einen Zustand eines Themas setzen: anheften, schließen, „gelöst" (F1 Stufe 3).
 *
 * WER DARF WAS, steht pur und getestet in `shared/topicState.ts` — dieselbe
 * Regel liest die Oberfläche, um Menüpunkte auszublenden. Diese Route bleibt
 * die AUTORITÄT: sie übersetzt das Urteil in die HTTP-Antwort (Muster
 * `[id].patch.ts` mit `decidePostAuthorAction`).
 *
 * ── WARUM DIE RECHTE-PRÜFUNG HIER NICHT `requireCommunityPermission` IST ────
 * Der Wächter WIRFT bei fehlender Capability — und genau das darf hier nicht
 * passieren: „gelöst" darf AUCH der Themen-Autor setzen, der `posts.moderate`
 * gerade NICHT hat. Ein `try/catch` um den Wächter wäre die naheliegende
 * Abkürzung und die falsche: er protokolliert bei jedem Operator-Break-Glass
 * (`community.operator_access`), ein verschlucktes 403 würde also entweder
 * Log-Rauschen erzeugen oder den Break-Glass-Vermerk unterschlagen. Deshalb
 * die PURE Entscheidung `decideCommunityAccess` — dieselbe, die der Wächter
 * intern benutzt — als reine Frage, ohne Nebenwirkung.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4) vor allem anderen, wie in jeder posts-Route.
  requirePlanProduct(event, 'posts')

  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  const body = await readValidatedBody(event, topicStateSchema.parse)

  // Darf dieser Mensch in DIESER Community moderieren? Gefragt, nicht erzwungen.
  const tenantScoped = !!event.context.tenant
  const role = tenantScoped ? await resolveCommunityRole(event) : null
  const moderation = decideCommunityAccess({
    capability: 'posts.moderate',
    labels: user.labels ?? [],
    tenantScoped,
    role,
  })
  const canModerate = moderation.allowed

  /**
   * WER HANDELT (C1c) — und hier hängt wirklich etwas daran:
   *
   *  - Moderation (anheften, schließen, fremdes Thema als gelöst markieren)
   *    ist `actor: 'operator'`. Die Inhalts-Sperre (M13) lässt sie
   *    ausdrücklich durch: eine zahlungssäumige Community muss moderierbar
   *    bleiben, sonst wird sie zum Problem des Betreibers.
   *  - Der AUTOR, der seine eigene Frage als gelöst markiert, handelt dagegen
   *    in eigener Sache an eigenem INHALT — `actor: 'member'`, also unter der
   *    Sperre. Genau dafür wurde `actor` von `as` getrennt.
   *
   * Die Klinke bleibt in beiden Fällen `'operator'`, und das ist reine Technik:
   * eine Beitrags-Zeile gibt `update` nur ihrem AUTOR (index.post.ts) — ein
   * Moderator käme mit der Mitglieder-Klinke gar nicht an die Zeile.
   *
   * Bekannte Unschärfe, bewusst hingenommen: ein Moderator, der sein EIGENES
   * Thema als gelöst markiert, gilt hier als Moderator und kommt damit auch in
   * einer gesperrten Community durch. Ihn anders zu behandeln als bei jeder
   * anderen seiner Handlungen wäre schwerer zu erklären als der Sonderfall.
   */
  /**
   * WARTUNGSMODUS — und zwar NUR für den Nicht-Moderator (S10b).
   *
   * Dieselbe Trennung wie eine Zeile weiter unten beim `actor`, und aus
   * demselben Grund: der Schalter richtet sich an MITGLIEDER. Ein Autor, der
   * seine Frage als gelöst markiert, schreibt Inhalt und steht still; ein
   * Moderator, der während des Aufräumens ein Thema schließt oder anheftet,
   * darf sein Werkzeug behalten — genau so nimmt der Bestands-Test
   * (posts-maintenance-gate) die Moderations-Routen hide/restore aus.
   *
   * Diese Route ist die erste, die BEIDES ist, deshalb ist die Prüfung hier
   * bedingt statt am Anfang der Datei.
   */
  if (!canModerate) {
    const appConfig = await getAppConfig(event)
    if (appConfig.maintenanceMode) {
      throw createError({ status: 403, statusText: 'Maintenance mode' })
    }
  }

  const db = tenantDb(event, { as: 'operator', actor: canModerate ? 'operator' : 'member' })

  // `get` durch die Tür belegt die Zugehörigkeit VOR der Entscheidung: ein
  // Thema aus einer fremden Community ist „nicht vorhanden".
  const row = await db.get<CommunityPost>(POSTS_TABLE, id, 'Post not found')

  const decision = decideTopicStateChange(
    body.field,
    { userId: user.$id, canModerate },
    { authorId: row.authorId, status: row.status },
  )
  if (decision.reason === 'not_allowed') {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  if (decision.reason === 'not_published') {
    throw createError({
      status: 409,
      statusText: 'Only published topics have states',
      data: { code: 'topic_not_published' },
    })
  }

  /**
   * NUR das eine Feld schreiben — kein Nachziehen von `lastActivityAt`.
   * Anheften ist keine Wortmeldung; die Spalte „Aktivität" würde sonst
   * behaupten, an dem Thema sei etwas passiert, obwohl nur jemand aufgeräumt
   * hat. Dieselbe Unterscheidung, die posts-009 überhaupt erst nötig machte.
   */
  const updated = await db.update<CommunityPost>(POSTS_TABLE, id, {
    [body.field]: body.value,
  }).catch((error) => {
    throw toH3Error(error, 'Could not update topic state')
  })

  return {
    ok: true,
    pinned: updated.pinned,
    closed: updated.closed,
    solved: updated.solved,
  }
})
