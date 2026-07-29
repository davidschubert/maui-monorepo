import { presenceHeartbeatSchema } from '../../../schemas/presence'

/**
 * Presence-Heartbeat (SSR-Cookie-Architektur): Der Browser kann seine eigene
 * Presence NICHT selbst schreiben — der Web-SDK-Client hat keine Session
 * (httpOnly-Cookie authentifiziert weder den Realtime-WS noch PUT /presences),
 * daher upserten wir sie hier server-seitig mit dem Admin-Client. Der Reader
 * (usePresence) liest weiterhin direkt über die Presences-API (Cookie-GET).
 *
 * Eine Presence pro User (presenceId = userId); metadata trägt scope/action/
 * typing. Kurze Expiry (90s) → verlässt der User die Seite, räumt der Server ab.
 */
// Server-Expiry > Frische-Fenster (180s): eine „frische" Presence darf nie schon
// abgelaufen sein, sonst würde sie zwischen zwei gedrosselten Heartbeats server-
// seitig verschwinden (Flackern). 240s hält Puffer über die Drossel-Lücke.
const PRESENCE_TTL_MS = 240_000

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  // Zod statt loser typeof-Checks: metadata ist für alle eingeloggten User
  // lesbar — Längen-Caps verhindern Bloat/Appwrite-Limit-Fehler (422 bei Junk).
  const body = await readValidatedBody(event, presenceHeartbeatSchema.parse)

  const prefs = user.prefs as { avatarUrl?: string } | undefined
  const metadata: Record<string, unknown> = { userName: user.name }
  // Mandant (Audit B1): im Pool teilen sich ALLE Communities ein Appwrite-
  // Projekt und damit EINEN Presences-Raum. Ohne dieses Merkmal kann kein Leser
  // fremde Anwesende aussortieren. NIE aus dem Body (der Zod-Parse verwirft
  // unbekannte Felder ohnehin) — nur aus dem serverseitig aufgelösten Kontext.
  // Silo/kein Tenant: NICHT setzen — die Leser erwarten dort „ohne tenantId".
  const tenant = useTenant(event)
  if (tenant?.mode === 'pool') metadata.tenantId = tenant.tenantId
  if (typeof prefs?.avatarUrl === 'string' && prefs.avatarUrl) metadata.avatarUrl = prefs.avatarUrl
  if (body.scope) metadata.scope = body.scope
  if (body.action) metadata.action = body.action
  if (body.typing === true) metadata.typing = true
  if (body.page) metadata.page = body.page
  if (body.replyingTo) metadata.replyingTo = body.replyingTo
  if (body.near) metadata.near = body.near
  if (body.away === true) metadata.away = true

  try {
    const { presences } = createAdminClient(event)
    await presences.upsert({
      presenceId: user.$id,
      userId: user.$id,
      status: 'online',
      // DIE GRENZE (A4, seit 2026-07-29 — Weg (c) aus
      // docs/archiv/PRESENCE-GRENZE.md, David entschieden):
      // Pool → read("label:<siteId>"), Silo/Single-Tenant → read("users") wie
      // bisher. Vorher stand hier im Pool `read("users")` — im geteilten
      // Projekt also JEDER eingeloggte User ALLER Communities: wer
      // presences.list() von Hand gegen Appwrite rief, sah userId + userName +
      // avatarUrl aller Online-User aller Mandanten (Audit B1). Der
      // tenantId-Filter (presenceFilter.ts / usePresence.ts) war dagegen nur
      // ANWENDUNGSLOGIK; jetzt zieht Appwrite die Grenze selbst und der Filter
      // ist das Netz darunter (Gürtel und Hosenträger — NICHT entfernen).
      //
      // `tenantRowPermissionsFor` ist bewusst DERSELBE Bauer wie für alle
      // anderen Zeilen (tenantDb.create) — keine Presence-Sonderregel. Das
      // Label trägt, wer den Host benutzt (server/middleware/site-label.ts).
      // Pool ohne siteId (Datenfehler) → kein read: fail-closed.
      //
      // update/delete für den Owner: Appwrites Realtime-Presence-Handler
      // (Presences/State.php) UPDATEt die Presence beim WS-Verarbeiten — ohne
      // diese Rechte wirft er „No permissions for action 'update'" und der
      // Realtime-Pfad bricht ab (nur read würde die Owner-Defaults verdrängen).
      permissions: tenantRowPermissionsFor(tenant, { read: 'members', ownerUserId: user.$id }),
      expiresAt: new Date(Date.now() + PRESENCE_TTL_MS).toISOString(),
      metadata,
    })
  }
  catch {
    // best effort — Presence ist eine flüchtige Zusatzschicht, kein Kernpfad
  }

  return { ok: true }
})
