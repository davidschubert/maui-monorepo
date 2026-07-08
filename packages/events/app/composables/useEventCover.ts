/**
 * View-URL eines Covers im Bucket 'event-covers' (Migration events-002) —
 * Dateien sind read(any), der Browser lädt direkt vom Appwrite-Endpoint
 * (Muster fonts/useCustomFonts).
 */
export function useEventCover() {
  const config = useRuntimeConfig()
  return {
    coverUrl: (fileId: string) =>
      `${config.public.appwriteEndpoint}/storage/buckets/event-covers/files/${fileId}/view?project=${config.public.appwriteProjectId}`,
  }
}
