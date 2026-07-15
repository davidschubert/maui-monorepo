import type { PublicMediaItem } from '../../shared/types/media'

/**
 * Öffentliche Galerie-Einträge (published, sortiert) — SSR-hydriert.
 * Für Site-Seiten (Galerie-Grids); die Verwaltung läuft über
 * /dashboard/media (media.manage).
 */
export function useMediaItems() {
  return useFetch<{ items: PublicMediaItem[] }>('/api/media')
}
