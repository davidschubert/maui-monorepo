/** Kompakte Zähler fürs UI: 82 · 722 · 13.4K · 1.2M (Punkt-Notation bewusst sprachneutral) */
export function formatCount(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) {
    const k = value / 1000
    return `${k < 100 ? (Math.round(k * 10) / 10).toString().replace(/\.0$/, '') : Math.round(k)}K`
  }
  const m = value / 1_000_000
  return `${(Math.round(m * 10) / 10).toString().replace(/\.0$/, '')}M`
}
