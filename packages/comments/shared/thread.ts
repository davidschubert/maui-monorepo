import type { Comment, CommentNode } from './types/comment'

/**
 * Baut den Kommentar-Baum aus der flachen Liste: Top-Level behält die
 * (Server-)Reihenfolge der Eingabe, Antworten werden NEUESTE ZUERST sortiert
 * (Quora-Muster — die frische Antwort erscheint direkt unter dem Formular,
 * nicht am Ende langer Ketten).
 * Verwaiste Antworten (parentId nicht in der Liste) erscheinen NICHT als
 * Top-Level — sie hängen an einem nicht geladenen Parent und werden weggelassen.
 * Reine Funktion → unit-testbar; genutzt vom Comment-Store.
 */
export function buildCommentTree(rows: Comment[]): CommentNode[] {
  const children = new Map<string, Comment[]>()
  for (const row of rows) {
    if (!row.parentId) continue
    const list = children.get(row.parentId) ?? []
    list.push(row)
    children.set(row.parentId, list)
  }

  const toNode = (comment: Comment): CommentNode => ({
    comment,
    children: (children.get(comment.$id) ?? [])
      .slice()
      .sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
      .map(toNode),
  })

  return rows.filter(row => !row.parentId).map(toNode)
}

/**
 * IDs eines Kommentars UND aller (transitiven) geladenen Nachfahren — inklusive
 * der Wurzel-ID selbst. Reine Funktion (Fixpunkt-BFS über die flache Liste) für
 * Subtree-Entfernung im Store (Hard-Delete + Moderation-Hide): so verwaisen
 * geladene Antworten nicht, wenn ihr Parent verschwindet.
 */
export function descendantIds(rows: Comment[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const row of rows) {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.$id)) {
        ids.add(row.$id)
        grew = true
      }
    }
  }
  return ids
}
