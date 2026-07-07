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

export interface EventRow extends Models.Row {
  title: string
  description: string
  startAt: string
  endAt: string | null
  location: string | null
  /** externe Event-URL (Meeting-Link o. Ä.) — kein Live-Streaming (v1) */
  url: string | null
  /** max. Plätze (nur 'going' zählt) — null = unbegrenzt */
  capacity: number | null
  /** denormalisiert, schreibt NUR der Server (atomare Increments) */
  attendeeCount: number
  status: EventStatus
  organizerId: string
  organizerName: string
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

export interface EventListResponse {
  rows: EventWithRsvp[]
  nextCursor: string | null
}

export interface RsvpResponse {
  event: EventRow
  myRsvp: RsvpStatus | null
}
