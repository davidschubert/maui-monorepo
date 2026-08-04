import { topicAcceptsWrites } from '../../shared/topicState'
import { POSTS_TABLE, type CommunityPost } from '../../shared/types/post'

/**
 * GESCHLOSSENE THEMEN NEHMEN KEINE KOMMENTARE MEHR AN (F1 Stufe 3) — die
 * posts-Seite des Core-Vertrags `registerContentWriteGuard`.
 *
 * `comments` ruft `assertContentWritable(event, 'post', <id>)` vor jedem neuen
 * Kommentar und weiß dabei nicht, dass es Beiträge gibt — geschweige denn, dass
 * sie geschlossen sein können (A14). Hier steht, was das für DIESEN Layer
 * bedeutet.
 *
 * ── Die Klinke: `as: 'operator'` (technisch nötig) ─────────────────────────
 * Derselbe Grund wie beim Aktivitäts-Handler nebenan, nur eine Stufe härter:
 * dieser Wächter läuft AUCH im Gast-Pfad (guest.post.ts), und ein Gast hat gar
 * keine Sitzung, mit der man lesen könnte. Mit der Mitglieder-Klinke wäre die
 * Prüfung für Gäste ein Fehler statt einer Antwort. Die Datentür bleibt damit
 * die einzige Mandantengrenze — und sie greift: `get` belegt die Zugehörigkeit,
 * ein Kommentar aus Community A kann also nicht am Zustand eines Themas aus
 * Community B gemessen werden.
 *
 * ── Der Handelnde: `actor: 'operator'` (fachlich gewollt, C1c) ─────────────
 * Es wird nur GELESEN, die Sperre (M13) und der Beitritt (A5) hängen ohnehin
 * am Schreiben. Der `actor` steht trotzdem ausdrücklich da: er ist die Aussage
 * über den Handelnden, nicht ein Schalter für den einen Ort, an dem sie heute
 * wirkt — und „gehandelt" hat hier niemand, das ist eine Buchprüfung vor der
 * eigentlichen Handlung.
 *
 * ── NICHT AUFFINDBAR HEISST „ERLAUBT" ──────────────────────────────────────
 * Eine gelöschte Zeile, eine erfundene Id, ein Ziel aus einer fremden Community
 * — in allen drei Fällen gibt es kein geschlossenes Thema, also nichts zu
 * verbieten. Der Kommentar scheitert dann eine Zeile später an der Stelle, die
 * dafür zuständig ist (Row-Permissions, Datentür), mit der richtigen Meldung.
 * Hier zu werfen hieße, diesem Wächter eine zweite Aufgabe zu geben, die er
 * schlechter erledigt als der Eigentümer.
 *
 * Ein UNERWARTETER Fehler wird dagegen NICHT geschluckt — er reist nach oben
 * und verhindert den Kommentar. Warum das richtig ist (und warum es sich vom
 * Aktivitäts-Vertrag unterscheidet), steht im Kopf von
 * core/server/utils/contentWritable.ts.
 */
export default defineNitroPlugin(() => {
  registerContentWriteGuard('post', async (event, target) => {
    const row = await tenantDb(event, { as: 'operator', actor: 'operator' })
      .get<CommunityPost>(POSTS_TABLE, target.targetId, 'Post not found')
      .catch((error: unknown) => {
        // NUR das „gibt es nicht" abfangen. Alles andere (Netz, Rechte,
        // Zeitüberschreitung) muss durch — ein Wächter, der bei Störung
        // durchwinkt, ist keiner.
        const status = (error as { status?: number, statusCode?: number })?.status
          ?? (error as { statusCode?: number })?.statusCode
        if (status === 404) return null
        throw error
      })

    if (!row || topicAcceptsWrites(row)) return

    throw createError({
      status: 403,
      statusText: 'This topic is closed',
      // Fachlicher Grund für den Client: der zentrale Handler hebt ihn als
      // `reason` ins Envelope (core/server/error.ts), die Kommentar-Oberfläche
      // zeigt daraufhin „Thema geschlossen" statt einer nackten 403.
      data: { code: 'topic_closed' },
    })
  })
})
