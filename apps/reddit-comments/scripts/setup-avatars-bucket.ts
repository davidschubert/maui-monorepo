/**
 * Legt den Avatar-Storage-Bucket an (Profilfotos). Buckets gehören der App
 * (Core besitzt keine Appwrite-Ressourcen). Idempotent (409 → skip).
 *
 *   node --experimental-strip-types --env-file=apps/reddit-comments/.env \
 *     apps/reddit-comments/scripts/setup-avatars-bucket.ts
 *
 * Benötigte Key-Scopes: buckets.write (Migrations-Key).
 */
import { Client, Storage, Permission, Role } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !apiKey) {
  console.error('Fehlende Env-Vars — Script mit --env-file=apps/reddit-comments/.env aufrufen.')
  process.exit(1)
}

const BUCKET_ID = 'avatars'
const storage = new Storage(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === code
}

try {
  await storage.createBucket({
    bucketId: BUCKET_ID,
    name: 'Avatars',
    // Upload durch eingeloggte User. fileSecurity=true → die pro Datei gesetzten
    // Rechte gelten (Upload-Route: read(any) + update/delete(owner)) → öffentlich
    // sichtbar, aber nur der Besitzer kann ersetzen/löschen.
    permissions: [Permission.create(Role.users())],
    fileSecurity: true,
    enabled: true,
    maximumFileSize: 5 * 1024 * 1024,
    allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  })
  console.log(`✔ Bucket "${BUCKET_ID}" angelegt`)
}
catch (error) {
  if (hasCode(error, 409)) {
    console.log(`↷ Bucket "${BUCKET_ID}" existiert bereits`)
  }
  else {
    console.error('✖ Bucket-Anlage fehlgeschlagen:', error)
    process.exit(1)
  }
}
