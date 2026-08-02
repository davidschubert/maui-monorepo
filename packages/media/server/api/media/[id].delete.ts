import { MEDIA_TABLE, MEDIA_BUCKET, type MediaItem } from '../../../shared/types/media'

/**
 * Medien-Eintrag löschen (media.manage) — Row zuerst, dann Datei (best-effort).
 *
 * DATENTÜR (C1b): `get` und `remove` belegen beide die Zugehörigkeit — eine
 * fremde Row antwortet 404 wie eine, die es nicht gibt. `as:'operator'` ist
 * fachlich nötig: `media_items`-Rows tragen seit media-002 NUR Leserechte,
 * gelöscht wird server-seitig hinter der Capability. Der Admin-Client umgeht
 * Row-Permissions, damit ist die Tür hier die EINZIGE Mandanten-Grenze.
 *
 * WER HANDELT: `actor: 'member'` (Audit-Befund 2026-08-01) — die Klinke ist
 * Technik, gehandelt hat die Redaktion der Community. Löschen ist ein
 * Inhalts-Vorgang wie das Löschen eines eigenen Kommentars und fällt damit
 * unter dieselbe Sperre (M13).
 *
 * AUTORISIERUNG (S3): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 * Das `await` ist Pflicht — ohne wäre der Gate fail-open.
 */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'media.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing media id' })
  }

  const admin = createAdminClient(event)
  const db = tenantDb(event, { as: 'operator', actor: 'member' })

  // Erst lesen (fileId für den Bucket-Cleanup), dann löschen — beide Schritte
  // gehen durch die Tür, die zweite Prüfung ist der Preis dafür, dass die
  // Zugehörigkeit nirgends „schon vorher geprüft" geglaubt werden muss.
  const row = await db.get<MediaItem>(MEDIA_TABLE, id, 'Media item not found')
  await db.remove(MEDIA_TABLE, id, 'Media item not found')

  // Datei best-effort — eine Waise im Bucket ist ärgerlich, aber kein Leak
  // (Row weg = nicht mehr gelistet); laut loggen statt 500 nach Row-Delete.
  await admin.storage.deleteFile({ bucketId: MEDIA_BUCKET, fileId: row.fileId }).catch((error) => {
    console.error(`[media] Datei ${row.fileId} zu gelöschtem Eintrag ${id} konnte nicht entfernt werden:`, error)
  })

  return { ok: true }
})
