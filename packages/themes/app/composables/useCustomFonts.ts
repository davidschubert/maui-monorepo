import type { CustomFontDto } from '../../shared/fonts'

/**
 * Individuelle Schriften (Theme-Studio) — beim App-Start SSR-geladen
 * (theme-Plugin), via useState zum Client serialisiert. Die Verwaltungsseite
 * refresht nach CRUD.
 */
export function useCustomFontsState() {
  return useState<CustomFontDto[]>('maui-custom-fonts', () => [])
}

/** Fonts vom Server holen (App-Start + nach CRUD) — best effort. */
export async function refreshCustomFonts(): Promise<void> {
  const fonts = useCustomFontsState()
  try {
    const data = await $fetch<{ fonts: CustomFontDto[] }>('/api/fonts')
    fonts.value = data.fonts
  }
  catch { /* Anzeige behält den letzten Stand */ }
}

/** Öffentliche View-URL einer Font-Datei im 'fonts'-Bucket */
export function fontFileUrl(fileId: string): string {
  const config = useRuntimeConfig()
  return `${config.public.appwriteEndpoint}/storage/buckets/fonts/files/${fileId}/view?project=${config.public.appwriteProjectId}`
}
