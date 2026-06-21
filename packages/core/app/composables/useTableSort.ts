export type SortDir = 'asc' | 'desc'

/**
 * Sortier-State für server-seitig sortierte Tabellen. toggle(field): gleiches
 * Feld → Richtung umdrehen, neues Feld → desc. Reihenfolge in die Fetch-Query
 * geben (sort/dir); bei Wechsel die Seite auf 1 zurücksetzen.
 */
export function useTableSort(field: string, dir: SortDir = 'desc') {
  const sortField = ref(field)
  const sortDir = ref<SortDir>(dir)

  function toggle(nextField: string) {
    if (sortField.value === nextField) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    }
    else {
      sortField.value = nextField
      sortDir.value = 'desc'
    }
  }

  return { sortField, sortDir, toggle }
}
