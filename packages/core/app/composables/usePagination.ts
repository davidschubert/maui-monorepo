// Explizite Vue-Imports statt Nuxt-Auto-Imports — das Composable ist
// dadurch ohne Nuxt-Context unit-testbar (Phase 8)
import { ref, computed, isRef } from 'vue'
import type { Ref } from 'vue'

export interface PaginationOptions {
  /** Default 25 — passend zum Appwrite Query-Default-Limit */
  pageSize?: number
  total?: Ref<number> | number
}

export function usePagination(options: PaginationOptions = {}) {
  const page = ref(1)
  const pageSize = ref(options.pageSize ?? 25)
  const total = isRef(options.total) ? options.total : ref(options.total ?? 0)

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const offset = computed(() => (page.value - 1) * pageSize.value)
  const hasPrev = computed(() => page.value > 1)
  const hasNext = computed(() => page.value < totalPages.value)

  function setPage(value: number) {
    page.value = Math.min(Math.max(1, value), totalPages.value)
  }

  function next() {
    if (hasNext.value) page.value += 1
  }

  function prev() {
    if (hasPrev.value) page.value -= 1
  }

  return { page, pageSize, total, totalPages, offset, hasPrev, hasNext, setPage, next, prev }
}
