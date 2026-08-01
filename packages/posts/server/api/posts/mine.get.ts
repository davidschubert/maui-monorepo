import { Query } from 'node-appwrite'
import { POSTS_TABLE, type CommunityPost, type PostMineResponse } from '../../../shared/types/post'

/**
 * „Meine Beiträge" — die eigene Verwaltungssicht des VERFASSERS (C16).
 *
 * WARUM ES DIESE ROUTE GIBT: `posts.write` hatte im ganzen Repo keinen
 * einzigen Konsumenten. Ein Editor (posts.write, KEIN posts.moderate) durfte
 * laut Rollen-Matrix Beiträge verfassen, hatte im Dashboard aber keine Fläche
 * dafür — /dashboard/posts und /api/posts/moderation verlangen beide
 * `posts.moderate`. Die Capability war damit eine Zusage ohne Einlösung.
 *
 * Das ANLEGEN bleibt bewusst ungegatet (index.post.ts, „member-led": jeder
 * Angemeldete darf posten, Plan P5) — diese Route gibt nur der
 * DASHBOARD-Verwaltung ihre Autorisierung. Deshalb ist `posts.write` hier
 * richtig und nicht zu streng: sie beschreibt, wer im Dashboard mit Beiträgen
 * arbeitet, nicht wer im Feed schreiben darf.
 *
 * Reihenfolge wie in moderation.get.ts: Produkt-Gate VOR der Autorisierung —
 * enthält der Plan das Produkt nicht, existiert es für diesen Mandanten gar
 * nicht (404 wie die Datentür). Das `await` vor requireCommunityPermission ist
 * Pflicht: ohne wäre der Gate fail-open (ein Promise ist wahrheitswertig).
 */
export default defineEventHandler(async (event): Promise<PostMineResponse> => {
  requirePlanProduct(event, 'posts')
  const { user } = await requireCommunityPermission(event, 'posts.write')

  // Datentür als Operator — und zwar aus EINEM konkreten Grund: ein
  // ausgeblendeter Beitrag verliert seine Veröffentlichungs-Permission
  // (hide.post.ts, `withoutPublishedRead`), und eine eigene read-Zeile für den
  // Autor trägt ein published-Post nicht (index.post.ts). Mit dem Session-
  // Client fielen genau die Beiträge STILL aus der Liste, deren Zustand der
  // Verfasser am dringendsten sehen muss. Der `authorId`-Filter ist deshalb
  // keine Bequemlichkeit, sondern die Grenze: die Tür scopt den Mandanten,
  // diese Zeile den Verfasser. Dieselbe Türklinke nutzt der Autor schon beim
  // Löschen ([id].delete.ts).
  // 'deleted' bleibt draußen: der Soft-Delete ist Historie, keine Ansicht.
  const res = await tenantDb(event, { as: 'operator' }).list<CommunityPost>(POSTS_TABLE, [
    Query.equal('authorId', user.$id),
    Query.equal('status', ['published', 'scheduled', 'hidden']),
    Query.orderDesc('$createdAt'),
    Query.limit(50),
  ]).catch((error) => { throw toH3Error(error, 'Could not load posts') })

  return { rows: res.rows }
})
