import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { COMMENTS_TABLE, VOTES_TABLE, type Comment, type CommentVote } from '../../shared/types/comment'

/**
 * GDPR-Contributor des comments-Layers (Vertrag: core/server/utils/userData.ts).
 *
 * Export: alle Kommentare + Votes des Users (vollständig paginiert).
 * Löschung: Kommentare werden zum TOMBSTONE anonymisiert (Row-Erasure —
 * `authorId/authorName/content` leer, `status: 'deleted'`), NICHT hart
 * gelöscht: Hard-Delete würde Threads zerreißen (parentId/rootId fremder
 * Antworten) und die Antworten ANDERER User sind deren Daten. Der leere
 * Sentinel wird von der UI als „[gelöscht]" gerendert. Votes werden hart
 * gelöscht; die denormalisierten Zähler bleiben (Aggregate ohne
 * Personenbezug, Selbstheilung beim nächsten Vote). Plan §4.4, E1/E2.
 *
 * WAS HIER BEWUSST NICHT DRINSTEHT: `guest_authors` (Audit-Befund 2026-08-01,
 * erledigt mit F18 am 2026-08-02).
 *
 * Die Tabelle trug Name, E-Mail und IP-Hash der Gast-Kommentare — und genau die
 * waren über diesen Vertrag NICHT erreichbar: er ist auf eine `userId`
 * geschlüsselt, und ein Gast hat keine. Auch der Umweg „Kommentare des Users
 * einsammeln und die zugehörigen Kontaktzeilen mitnehmen" trug nicht:
 * Gast-Kommentare haben `authorId: ''`, sie gehören per Definition keinem
 * Konto. Bliebe die Adresse als Schlüssel — dafür hatte `guest_authors` keinen
 * Index, und „wer sich später mit derselben Adresse anmeldet, ist derselbe
 * Mensch" wäre eine Annahme, keine Tatsache.
 *
 * Die erste Antwort darauf war eine FRIST (90 Tage). Die zweite und endgültige
 * ist, die Daten gar nicht mehr zu erheben: seit F18 nimmt `guest.post.ts` von
 * einem Gast nur noch den Anzeigenamen entgegen, der ohnehin öffentlich am
 * Kommentar steht. Damit hat dieser Vertrag keine Lücke mehr zu erklären —
 * es gibt keine kontolose Kontaktspur, die er auslassen könnte. Der Sweep
 * (`guestAuthorPrune.ts`) räumt nur noch den Altbestand ab.
 */

export function commentsExportUserData(event: H3Event, userId: string) {
  return exportData(event, userId)
}

async function exportData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [comments, votes] = await Promise.all([
    listAllRows<Comment>(tablesDB, databaseId, COMMENTS_TABLE, [Query.equal('authorId', userId)]),
    listAllRows<CommentVote>(tablesDB, databaseId, VOTES_TABLE, [Query.equal('userId', userId)]),
  ])

  return {
    comments: comments.map(r => ({
      id: r.$id,
      createdAt: r.$createdAt,
      content: r.content,
      targetType: r.targetType,
      targetId: r.targetId,
      status: r.status,
    })),
    votes: votes.map(r => ({
      commentId: r.commentId,
      value: r.value,
      createdAt: r.$createdAt,
    })),
  }
}

export async function commentsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // Kommentare → Tombstone (Row-Erasure). Nach dem Update matcht die Row den
  // authorId-Filter nicht mehr → Re-Run findet leere Seiten (idempotent).
  const comments = await listAllRows<Comment>(tablesDB, databaseId, COMMENTS_TABLE, [Query.equal('authorId', userId)])
  for (const row of comments) {
    await tablesDB.updateRow({
      databaseId,
      tableId: COMMENTS_TABLE,
      rowId: row.$id,
      data: { authorId: '', authorName: '', content: '', status: 'deleted', editedAt: null },
      // Owner-Permissions (update/delete des Ex-Users) abräumen; das
      // LESERECHT der Zeile bleibt unangetastet — der Tombstone ist so sichtbar
      // wie der Kommentar vorher war, enthält aber keine PII.
      //
      // C18: bewusst FILTERN statt read(any) zu setzen. Diese Löschung läuft
      // mandantenübergreifend (GDPR-Orchestrierung, außerhalb der Datentür) und
      // fasst Zeilen aus MEHREREN Communities an — ein festes read(any) hätte
      // die Tombstones einer geschlossenen Community öffentlich gemacht, und
      // ausgeblendete Kommentare (ohne Leserecht) wieder lesbar.
      permissions: row.$permissions.filter(permission => (
        permission !== Permission.update(Role.user(userId))
        && permission !== Permission.delete(Role.user(userId))
      )),
    })
  }

  // Votes → Hard-Delete
  const votes = await listAllRows<CommentVote>(tablesDB, databaseId, VOTES_TABLE, [Query.equal('userId', userId)])
  for (const row of votes) {
    await tablesDB.deleteRow({ databaseId, tableId: VOTES_TABLE, rowId: row.$id })
  }

  return { deleted: votes.length, anonymized: comments.length }
}
