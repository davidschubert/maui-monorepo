import type { Models } from 'node-appwrite'
import type { ChangelogEntry } from './types/admin'

/** Roh-Row der `changelog`-Tabelle (vor der DTO-Abbildung). */
export type ChangelogRow = Models.Row & Omit<ChangelogEntry, '$id' | '$createdAt'>

/** changelog-Row → DTO (leere Strings für fehlende optionale Felder). */
export function rowToChangelogEntry(r: ChangelogRow): ChangelogEntry {
  return {
    $id: r.$id,
    $createdAt: r.$createdAt,
    date: r.date ?? r.$createdAt,
    title: r.title,
    body: r.body,
    titleEn: r.titleEn ?? '',
    bodyEn: r.bodyEn ?? '',
    category: r.category ?? '',
    version: r.version ?? '',
    published: r.published,
  }
}

/**
 * Semver-artige Sortierung (absteigend) für Changelog-Einträge.
 *
 * Versionen werden NUMERISCH je Segment verglichen, nicht lexikografisch:
 * „v1.10" > „v1.9", „v2" > „v10" ist falsch herum bei String-Sort, daher hier
 * in Code. Einträge OHNE Version kommen ans Ende; bei gleicher (oder fehlender)
 * Version entscheidet das Datum absteigend (Fallback $createdAt).
 *
 * Pure TS ohne Deps → von Server (server/api) und Client (Components) nutzbar.
 */
interface SortableChangelog {
  version?: string
  date?: string
  $createdAt?: string
}

function parseVersion(value: string | undefined): number[] {
  const cleaned = (value ?? '').trim().replace(/^v/i, '')
  if (!cleaned) return []
  return cleaned.split('.').map((part) => {
    const n = Number.parseInt(part, 10)
    return Number.isFinite(n) ? n : 0
  })
}

export function compareChangelogByVersion(a: SortableChangelog, b: SortableChangelog): number {
  const va = parseVersion(a.version)
  const vb = parseVersion(b.version)

  if (va.length && vb.length) {
    const len = Math.max(va.length, vb.length)
    for (let i = 0; i < len; i++) {
      const diff = (vb[i] ?? 0) - (va[i] ?? 0) // absteigend
      if (diff !== 0) return diff
    }
  }
  else if (va.length !== vb.length) {
    return va.length ? -1 : 1 // Einträge mit Version zuerst
  }

  // gleiche/keine Version → Datum absteigend
  const da = a.date || a.$createdAt || ''
  const db = b.date || b.$createdAt || ''
  return db.localeCompare(da)
}
