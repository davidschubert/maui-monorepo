import type { Models } from 'node-appwrite'
import type { SiteRole } from './communityMember'

/**
 * Offene Einladung in EINE Kunden-Community (control-019).
 *
 * Bewusst dem M9-Muster nachgebaut (`workspace_invites`, Migration control-008)
 * statt ein zweites Verfahren zu erfinden: die DB kennt nur den SHA-256-HASH
 * des Tokens, der Klartext steht ausschließlich im Mail-Link. Ein DB-Leak
 * liefert damit keine einlösbaren Einladungen.
 *
 * WARUM eine eigene Table und nicht `community_members` mit status='invited':
 * eine Mitgliedschaft ist am Tripel {communityId, runtimeProjectId, runtimeUserId}
 * verankert, und zur Einladungszeit gibt es die runtimeUserId noch nicht (die
 * eingeladene Person hat vielleicht gar kein Konto). Erst die Annahme kennt
 * die Identität — dann entsteht die Mitgliedschaft.
 */
export const COMMUNITY_INVITE_STATUSES = ['pending', 'accepted', 'revoked'] as const
export type CommunityInviteStatus = (typeof COMMUNITY_INVITE_STATUSES)[number]

export interface CommunityInviteRow extends Models.Row {
  /** = tenants.$id (die Community, in die eingeladen wird). */
  communityId: string
  /** Adresse der Eingeladenen — bindet die Einladung (weitergeleiteter Link greift nicht). */
  email: string
  /** Rolle, die die Annahme vergibt. NIE 'owner' (Übergabe ist ein eigener Vorgang). */
  role: SiteRole
  tokenHash: string
  status: CommunityInviteStatus
  expiresAt: string
  /** runtimeUserId der einladenden Person (Spur, wer wen geholt hat). */
  invitedBy: string
  /** runtimeUserId nach der Annahme; bis dahin ''. */
  acceptedBy: string
}

export const COMMUNITY_INVITES_TABLE = 'community_invites'

/** Gültigkeit einer Einladung — wie bei den Workspace-Einladungen: 7 Tage. */
export const COMMUNITY_INVITE_TTL_MS = 7 * 24 * 3_600_000
