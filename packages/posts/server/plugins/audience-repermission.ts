import { POSTS_TABLE } from '../../shared/types/post'

/**
 * C18 — die Tabellen des posts-Layers, deren Zeilen eine
 * Veröffentlichungs-Permission tragen (core-Vertrag
 * registerAudienceRepermissionTable).
 *
 * NUR `community_posts`: `post_votes` sind wähler-eigen, `poll_votes` tragen
 * gar keine Permissions (nur über die Operator-Tür lesbar).
 */
export default defineNitroPlugin(() => {
  registerAudienceRepermissionTable({ layer: 'posts', table: POSTS_TABLE })
})
