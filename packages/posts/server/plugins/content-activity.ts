import { POSTS_TABLE, type CommunityPost } from '../../shared/types/post'

/**
 * AKTIVITÄT AN BEITRÄGEN (F1 Stufe 2) — die posts-Seite des Core-Vertrags
 * `registerContentActivityHandler`.
 *
 * `comments` ruft `notifyContentActivity(event, 'post', <id>)` nach jedem
 * angelegten Kommentar und weiß dabei nicht, dass es Beiträge gibt. Hier steht,
 * was das für DIESEN Layer bedeutet: `lastActivityAt` nachziehen.
 *
 * ── Die Klinke: `as: 'operator'` (technisch nötig) ──────────────────────────
 * Beitrags-Zeilen geben `update` nur dem AUTOR (index.post.ts). Wer antwortet,
 * ist fast nie der Autor — mit der Mitglieder-Klinke schlüge Appwrite jeden
 * Nachzug fehl. Die Datentür ist damit die einzige Mandantengrenze, und sie
 * greift: `update` belegt über `get` erst die Zugehörigkeit, ein Kommentar aus
 * Community A kann also keinen Beitrag aus Community B bewegen.
 *
 * ── Der Handelnde: `actor: 'operator'` (fachlich gewollt, C1c) ──────────────
 * Zwei Dinge hängen daran, und beide sollen hier NICHT passieren:
 *  - **M13-Sperre:** der Kommentar ist eine Zeile vorher schon durch sie
 *    hindurch. Ihn hier ein zweites Mal daran zu messen hieße nur, dass eine
 *    gerade gesperrte Community Löcher in ihrer Aktivitäts-Spalte bekommt —
 *    dieselbe Begründung wie bei `recordActivity` („die SPUR einer Handlung").
 *  - **A5-Beitritt:** ein Nachzug auf FREMDEM Inhalt darf niemanden zum
 *    Mitglied machen. Der Beitritt gehört zum Kommentar des Menschen, nicht zum
 *    Buchhaltungs-Update darunter — sonst zählte derselbe Vorgang doppelt.
 *  (`update` löst den Beitritt ohnehin nicht aus — nur `create` tut das. Der
 *  `actor` steht hier trotzdem ausdrücklich: er ist die Aussage über den
 *  Handelnden, nicht ein Schalter für den einen Ort, an dem sie heute wirkt.)
 *
 * ── Was der Nachzug NICHT tut ──────────────────────────────────────────────
 * Er fasst KEINE Row-Permissions an (`update` schreibt nur Datenfelder;
 * `updatePermissions` ist eine andere Methode). Das ist wichtig: die
 * Veröffentlichungs-Permission eines Beitrags trägt das Publikum der Community
 * (C18) — ein Nachzug, der sie neu setzte, könnte einen ausgeblendeten Beitrag
 * beim nächsten Kommentar wieder sichtbar machen.
 *
 * Was er unvermeidlich TUT: er bewegt `$updatedAt` und veröffentlicht ein
 * Realtime-Ereignis auf der Beitrags-Zeile. Beides ist hier richtig — eine neue
 * Antwort IST eine Veränderung an diesem Thema, und ein Feed-Abonnent soll sie
 * mitbekommen. (Bei den AUFRUFEN wäre genau das falsch; deshalb zählen die in
 * eine eigene Tabelle.)
 *
 * Wirft nicht: `notifyContentActivity` fängt ohnehin ab, aber der `.catch` steht
 * hier zusätzlich, damit der Log-Eintrag den Grund trägt und nicht nur „Handler
 * kaputt". Ein nicht gefundener oder fremder Beitrag ist KEIN Fehler — an
 * gelöschten Zeilen und an Zielen anderer Mandanten gibt es nichts nachzuziehen.
 */
export default defineNitroPlugin(() => {
  registerContentActivityHandler('post', async (event, input) => {
    await tenantDb(event, { as: 'operator', actor: 'operator' })
      .update<CommunityPost>(POSTS_TABLE, input.targetId, { lastActivityAt: input.at }, 'Post not found')
      .catch(() => null)
  })
})
