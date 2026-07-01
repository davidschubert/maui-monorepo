import { z } from 'zod'

/**
 * Presence-Heartbeat-Body: alle Felder optional, aber längenbegrenzt — die
 * metadata ist für alle eingeloggten User lesbar (read("users")) und darf
 * nicht als Ablage für beliebig große Strings missbraucht werden (Bloat/
 * Appwrite-Limits). Werte sind interne IDs/Slugs, 256 ist großzügig.
 */
const shortString = z.string().max(256)

export const presenceHeartbeatSchema = z.object({
  scope: shortString.optional(),
  action: shortString.optional(),
  typing: z.boolean().optional(),
  page: shortString.optional(),
  replyingTo: shortString.optional(),
  near: shortString.optional(),
  away: z.boolean().optional(),
})

export type PresenceHeartbeatInput = z.infer<typeof presenceHeartbeatSchema>
