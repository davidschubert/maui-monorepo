import type { Models } from 'node-appwrite'

export const EVENTS_TABLE = 'events'
export const EVENT_RSVPS_TABLE = 'event_rsvps'

/** draft = nur Verwaltung sichtbar · cancelled = Soft-Cancel (Row bleibt, sichtbar) */
export type EventStatus = 'draft' | 'published' | 'cancelled'
export const EVENT_STATUSES = ['draft', 'published', 'cancelled'] as const

export const RSVP_STATUSES = ['going', 'maybe', 'declined'] as const
export type RsvpStatus = (typeof RSVP_STATUSES)[number]

export const MAX_EVENT_TITLE = 200
export const MAX_EVENT_DESCRIPTION = 10_000
export const MAX_EVENT_LOCATION = 255
export const MAX_EVENT_URL = 500
export const MAX_EVENT_CAPACITY = 100_000

/** Ortstyp — null (Bestandsrows) wird zur Laufzeit abgeleitet: url gesetzt → online */
export type EventLocationType = 'venue' | 'online'

export const MAX_EVENT_COVER_BYTES = 2 * 1024 * 1024

export interface EventRow extends Models.Row {
  title: string
  description: string
  startAt: string
  endAt: string | null
  location: string | null
  /** Join-Link (Meet/Jitsi/Twitch/… — provider-agnostisch); kein Video-Hosting */
  url: string | null
  /** max. Plätze (nur 'going' zählt) — null = unbegrenzt */
  capacity: number | null
  /** denormalisiert, schreibt NUR der Server (atomare Increments) */
  attendeeCount: number
  status: EventStatus
  organizerId: string
  organizerName: string
  /** Cover im Bucket event-covers (Migration 002) — null = Theme-Fallback */
  coverFileId: string | null
  locationType: EventLocationType | null
  /** Aufzeichnung nach dem Event — Archiv zeigt „Replay ansehen" */
  replayUrl: string | null
}

/** effektiver Ortstyp inkl. Ableitung für Bestandsrows (locationType null) */
export function effectiveLocationType(row: Pick<EventRow, 'locationType' | 'url'>): EventLocationType {
  return row.locationType ?? (row.url ? 'online' : 'venue')
}

export interface EventRsvpRow extends Models.Row {
  eventId: string
  userId: string
  status: RsvpStatus
}

/** Event, wie es die Listen-/Detail-API anreichert */
export interface EventWithRsvp extends EventRow {
  /** eigene RSVP des eingeloggten Users (null = keine / Gast) */
  myRsvp: RsvpStatus | null
}

/** Detail-Anreicherung: Vorschau der Zusager (Avatar-Stack, Top-N) */
export interface EventDetailResponse extends EventWithRsvp {
  attendeePreview: Array<{ userId: string, avatarUrl: string | null }>
  organizerAvatarUrl: string | null
}

export interface EventListResponse {
  rows: EventWithRsvp[]
  nextCursor: string | null
}

export interface RsvpResponse {
  event: EventRow
  myRsvp: RsvpStatus | null
}
