import { describe, it, expect } from 'vitest'
import { buildCommentTree } from '../shared/thread'
import type { Comment } from '../shared/types/comment'

const mk = (id: string, parentId: string | null, createdAt: string): Comment => ({
  $id: id,
  parentId,
  $createdAt: createdAt,
  $updatedAt: createdAt,
  $permissions: [],
  $databaseId: '',
  $tableId: '',
  $sequence: '',
  targetId: 't',
  targetType: 'post',
  content: `c-${id}`,
  authorId: 'a',
  authorName: 'A',
  rootId: parentId ? 'r' : null,
  depth: parentId ? 1 : 0,
  editedAt: null,
  upvotes: 0,
  downvotes: 0,
  score: 0,
  status: 'active',
})

describe('buildCommentTree', () => {
  it('nur Top-Level → flache Knoten in Eingabe-Reihenfolge', () => {
    const tree = buildCommentTree([mk('b', null, '2'), mk('a', null, '1')])
    expect(tree.map(n => n.comment.$id)).toEqual(['b', 'a']) // Server-Reihenfolge bleibt
    expect(tree.every(n => n.children.length === 0)).toBe(true)
  })

  it('hängt Antworten unter den Parent und sortiert sie chronologisch', () => {
    const tree = buildCommentTree([
      mk('p', null, '2026-01-01'),
      mk('r2', 'p', '2026-01-03'),
      mk('r1', 'p', '2026-01-02'),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0]!.children.map(n => n.comment.$id)).toEqual(['r1', 'r2']) // chronologisch, nicht Eingabe
  })

  it('verschachtelt rekursiv (Antwort auf Antwort)', () => {
    const tree = buildCommentTree([
      mk('p', null, '1'),
      mk('r', 'p', '2'),
      mk('rr', 'r', '3'),
    ])
    expect(tree[0]!.children[0]!.comment.$id).toBe('r')
    expect(tree[0]!.children[0]!.children[0]!.comment.$id).toBe('rr')
  })

  it('verwaiste Antwort (Parent nicht geladen) erscheint NICHT als Top-Level', () => {
    const tree = buildCommentTree([mk('p', null, '1'), mk('orphan', 'missing', '2')])
    expect(tree.map(n => n.comment.$id)).toEqual(['p'])
  })

  it('leere Liste → leerer Baum', () => {
    expect(buildCommentTree([])).toEqual([])
  })
})
