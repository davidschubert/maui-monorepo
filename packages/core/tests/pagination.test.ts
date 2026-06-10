import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePagination } from '../app/composables/usePagination'

describe('usePagination', () => {
  it('startet mit Page 1, Default-PageSize 25 und Offset 0', () => {
    const { page, pageSize, offset } = usePagination()
    expect(page.value).toBe(1)
    expect(pageSize.value).toBe(25)
    expect(offset.value).toBe(0)
  })

  it('berechnet totalPages aus total und pageSize', () => {
    const { totalPages } = usePagination({ total: 100, pageSize: 25 })
    expect(totalPages.value).toBe(4)
  })

  it('rundet totalPages auf (angefangene Seite zählt)', () => {
    const { totalPages } = usePagination({ total: 101, pageSize: 25 })
    expect(totalPages.value).toBe(5)
  })

  it('leere Page: total 0 → eine Seite, kein next/prev', () => {
    const { totalPages, hasNext, hasPrev } = usePagination({ total: 0 })
    expect(totalPages.value).toBe(1)
    expect(hasNext.value).toBe(false)
    expect(hasPrev.value).toBe(false)
  })

  it('next() blättert vor und stoppt an der letzten Seite', () => {
    const { page, next } = usePagination({ total: 50, pageSize: 25 })
    next()
    expect(page.value).toBe(2)
    next()
    expect(page.value).toBe(2)
  })

  it('prev() blättert zurück und stoppt an Page 1', () => {
    const { page, next, prev } = usePagination({ total: 50, pageSize: 25 })
    next()
    prev()
    expect(page.value).toBe(1)
    prev()
    expect(page.value).toBe(1)
  })

  it('setPage() klemmt auf den gültigen Bereich', () => {
    const { page, setPage } = usePagination({ total: 100, pageSize: 25 })
    setPage(0)
    expect(page.value).toBe(1)
    setPage(99)
    expect(page.value).toBe(4)
  })

  it('offset folgt der aktuellen Page', () => {
    const { offset, setPage } = usePagination({ total: 100, pageSize: 25 })
    setPage(3)
    expect(offset.value).toBe(50)
  })

  it('reagiert auf reaktives total', () => {
    const total = ref(25)
    const { totalPages, hasNext } = usePagination({ total, pageSize: 25 })
    expect(totalPages.value).toBe(1)
    expect(hasNext.value).toBe(false)
    total.value = 80
    expect(totalPages.value).toBe(4)
    expect(hasNext.value).toBe(true)
  })
})
