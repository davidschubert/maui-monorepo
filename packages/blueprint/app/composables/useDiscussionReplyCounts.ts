/**
 * Antwort-Anzahlen für Topic-Listen — die Naht zwischen `posts` (Themen) und
 * `comments` (Antworten).
 *
 * Sie liegt in blueprint, weil sie GENAU HIER hingehört: der posts-Layer darf
 * den comments-Layer nicht kennen (A14), und beide Discussions-Seiten
 * (Übersicht und Kategorie) brauchen dieselbe Verdrahtung. Ein zweites Mal
 * geschrieben wäre sie der Anfang genau der Drift, gegen die der
 * Kompositions-Layer gebaut ist (PRODUKT-BILANZ.md).
 *
 * Bewusst NICHT im SSR vorgeladen: die Ids der Themen kennt erst die Tabelle,
 * und die holt sie selbst. Bis die Zahlen da sind, zeigt die Spalte einen
 * Strich statt einer Null — eine Null wäre eine Aussage, die noch niemand
 * geprüft hat. (Der Feed macht es anders, weil er seine erste Seite ohnehin
 * schon im SSR hat.)
 */
export function useDiscussionReplyCounts() {
  // useRequestFetch statt $fetch: im Pool entscheidet der Host über den
  // Mandanten — $fetch verlöre ihn im SSR (CLAUDE.md).
  const requestFetch = useRequestFetch()
  const replyCounts = ref<Record<string, number>>({})

  async function loadCounts(ids: string[]) {
    const missing = ids.filter(id => !(id in replyCounts.value))
    if (missing.length === 0) return
    try {
      const res = await requestFetch<{ counts: Record<string, number> }>('/api/comments/counts', {
        query: { targetType: 'post', targetIds: missing.join(',') },
      })
      replyCounts.value = { ...replyCounts.value, ...res.counts }
    }
    catch {
      // Ohne Zahlen bleibt der Strich stehen — die Liste bleibt benutzbar.
    }
  }

  return { replyCounts, loadCounts }
}
