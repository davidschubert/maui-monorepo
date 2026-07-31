import { COMMENTS_TABLE } from '../../shared/types/comment'

/**
 * C18 — die Tabellen des comments-Layers, deren Zeilen eine
 * Veröffentlichungs-Permission tragen und beim Umschalten der Sichtbarkeit
 * mitziehen müssen (core-Vertrag registerAudienceRepermissionTable).
 *
 * NUR `comments`: `comment_votes` sind wähler-eigen, `guest_authors` liegen
 * bewusst operator-only und `embed_sites` sind Betreiber-Konfiguration — keine
 * davon war je öffentlich lesbar, keine ändert sich also mit dem Publikum.
 */
export default defineNitroPlugin(() => {
  registerAudienceRepermissionTable({ layer: 'comments', table: COMMENTS_TABLE })
})
